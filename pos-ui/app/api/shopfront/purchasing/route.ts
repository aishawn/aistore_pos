import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server-auth";
import { fetchTenantOdooBinding } from "@/lib/odoo-tenant-company";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { loadPurchasingLedger, mergePurchasingSources } from "@/lib/shopfront-purchasing-ledger";
import { filterPurchasingRows, normalizePurchasingRow, type PurchasingKind, type ShopfrontPurchasingRecord } from "@/lib/shopfront-purchasing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map<PurchasingKind, { expires: number; rows: ShopfrontPurchasingRecord[] }>();
const pending = new Map<PurchasingKind, Promise<ShopfrontPurchasingRecord[]>>();
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const crawlerBase = (process.env.SHOPFRONT_CRAWLER_URL || "https://crawler.orithos.com.au").trim().replace(/\/+$/, "");
const integrationToken = process.env.SHOPFRONT_INTEGRATION_TOKEN?.trim() ?? "";

async function loadRows(kind: PurchasingKind) {
  const cached = cache.get(kind);
  if (cached && cached.expires > Date.now()) return cached.rows;
  const inFlight = pending.get(kind);
  if (inFlight) return inFlight;
  const loading = (async () => {
    const page = async (number: number) => {
      // Fixed internal destination and store: neither can be supplied by the caller.
      const response = await fetch(`${crawlerBase}/api/${kind}?store=skr&page=${number}&size=500`, {
        cache: "no-store", signal: AbortSignal.timeout(25_000),
        headers: { Authorization: `Bearer ${integrationToken}` },
      });
      if (!response.ok) throw new Error("Source unavailable");
      const body = await response.json();
      if (!Array.isArray(body.data) || !Number.isSafeInteger(body.pagination?.total) || body.pagination.total < 0) throw new Error("Invalid source response");
      return body;
    };
    const first = await page(1);
    const count = Math.ceil(first.pagination.total / 500);
    if (count > 100) throw new Error("Source exceeds directory limit");
    const rows = first.data.map((row: Parameters<typeof normalizePurchasingRow>[0]) => normalizePurchasingRow(row, kind)) as ShopfrontPurchasingRecord[];
    // Keep source requests bounded rather than fetching every history page at once.
    for (let start = 2; start <= count; start += 3) {
      const pages = await Promise.all(Array.from({ length: Math.min(3, count - start + 1) }, (_, i) => page(start + i)));
      for (const result of pages) rows.push(...result.data.map((row: Parameters<typeof normalizePurchasingRow>[0]) => normalizePurchasingRow(row, kind)));
    }
    if (rows.length !== first.pagination.total || new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error("Incomplete source snapshot");
    rows.sort((a, b) => kind === "suppliers" ? a.name.localeCompare(b.name) : b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    cache.set(kind, { rows, expires: Date.now() + 60_000 });
    return rows;
  })();
  pending.set(kind, loading);
  try { return await loading; } finally { pending.delete(kind); }
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ message: "Cross-origin requests are not allowed" }, 403);
  const params = request.nextUrl.searchParams;
  const kind = params.get("type");
  if (kind !== "suppliers" && kind !== "purchase-orders") return json({ message: "Invalid directory type" }, 400);
  try {
    await requirePermission(request, kind === "suppliers" ? "stock.suppliers" : "stock.purchases");
    const binding = await fetchTenantOdooBinding(request);
    if (!binding) return json({ message: "Could not verify this store's data source" }, 503);
    // SKR has a verified Shopfront archive. Do not infer a source from a query or
    // allow other tenants to see SKR through a shared service account.
    const enabled = binding.subdomain === "skr" && binding.r2Prefix === "shopfront/skr/" && binding.odooProvisionStatus === "ready";
    if (params.get("config") === "1") return json({ enabled });
    if (!enabled) return json({ message: "This store has no Shopfront purchasing directory" }, 404);
    const offset = Number(params.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return json({ message: "Invalid pagination" }, 400);
    const scope = await scopedOdoo(request);
    const companyId = binding.odooCompanyId;
    if (!companyId || scope.binding?.vendorId !== binding.vendorId || !scope.companyIds.includes(companyId)) return json({ message: "Could not verify purchasing company" }, 403);
    const ledger = await loadPurchasingLedger(scope.rpc, companyId, binding.subdomain, kind);
    let crawler: ShopfrontPurchasingRecord[];
    try { crawler = await loadRows(kind); } catch {
      if (!ledger.length) throw new Error("Purchasing sources unavailable");
      crawler = [];
    }
    const rows = mergePurchasingSources(ledger, crawler, kind);
    const items = filterPurchasingRows(rows, (params.get("query") ?? "").slice(0, 120), params.get("status") ?? "all");
    return json({ enabled: true, source: "Shopfront", readOnly: true, sourceTotal: rows.length, total: items.length,
      statuses: [...new Set(rows.map((row) => row.status))].sort(), items: items.slice(offset, offset + 40), offset, hasNext: offset + 40 < items.length });
  } catch (error) {
    const scopedError = error instanceof StoreAccessError || error instanceof OdooScopeError;
    return json({ message: scopedError ? error.message : "Could not load Shopfront purchasing data. Please retry." }, scopedError ? error.status : 502);
  }
}
