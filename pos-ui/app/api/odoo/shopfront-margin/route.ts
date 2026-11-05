import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { isSameOrigin } from "@/lib/server-auth";
import { loadSourceMarginSnapshot } from "@/lib/cost-reconciliation-source";
import { shopfrontSourceMargin } from "@/lib/shopfront-source-margin";
import { verifiedShopfrontSourceStore } from "@/lib/shopfront-store-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const pending = new Set<string>();
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ message: "Cross-origin requests are not allowed" }, 403);
  let key: string | undefined;
  try {
    await requirePermission(request, "reports.dashboard");
    const scope = await scopedOdoo(request);
    const sourceStore = verifiedShopfrontSourceStore(scope.binding);
    if (scope.companyIds.length !== 1 || !scope.database || !sourceStore) throw new OdooScopeError("Verified Shopfront store scope is required.", 403);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Array.isArray(body) || Object.keys(body).some(k => !["fromDay", "toDay"].includes(k))) return json({ message: "Invalid margin request" }, 400);
    for (const field of ["fromDay", "toDay"]) if (body[field] !== undefined && (typeof body[field] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body[field] as string))) return json({ message: "Invalid business date" }, 400);
    key = createHash("sha256").update(`${process.env.ODOO_BASE_URL}|${scope.database}|${scope.companyIds[0]}`).digest("hex");
    if (pending.has(key)) { key = undefined; return json({ message: "A source margin capture is already running. Please wait." }, 409); }
    pending.add(key);
    const snapshot = await loadSourceMarginSnapshot(scope.rpc, { companyId: scope.companyIds[0], store: scope.binding.subdomain, sourceStore,
      fromDay: body.fromDay as string | undefined, toDay: body.toDay as string | undefined });
    const sourceHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"), batchId = randomUUID();
    const report = { batchId, sourceHash, companyId: snapshot.companyId, store: snapshot.store, timezone: snapshot.timezone, from: snapshot.from, to: snapshot.to, capturedAt: snapshot.capturedAt,
      readOnly: true, sourceMargin: shopfrontSourceMargin(snapshot.sourceSales ?? [], snapshot.from, snapshot.to, snapshot.coverage?.sourceRowsComplete === true) };
    const dir = path.join(process.cwd(), ".local", "shopfront-source-margin", key);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(path.join(dir, `${batchId}.json`), JSON.stringify({ report, snapshot }), { flag: "wx", mode: 0o600 });
    return json(report);
  } catch (error) {
    if (error instanceof OdooScopeError || error instanceof StoreAccessError) return json({ message: error.message }, error.status);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    console.error("Shopfront source margin capture failed", { category: error instanceof Error ? error.name : "unknown", code: /^[A-Z_]{2,30}$/.test(code) ? code : undefined });
    return json({ message: "Could not capture complete source sales. Retry or choose a shorter period." }, 502);
  } finally { if (key) pending.delete(key); }
}
