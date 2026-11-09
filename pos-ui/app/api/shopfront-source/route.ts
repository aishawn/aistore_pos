import { NextRequest, NextResponse } from "next/server";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { isSameOrigin } from "@/lib/server-auth";
import { verifiedShopfrontSourceStoreFromHost } from "@/lib/shopfront-store-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINTS: Record<string, { path: string; params: string[]; permissions: string[] }> = {
  "products": { path: "/api/products", params: ["page", "size", "catalog_only", "status", "q", "brand", "category", "family", "tag", "supplier", "type", "tax_rate", "cost_tax_rate", "gift_card"], permissions: ["reports.dashboard", "stock.products.view", "stock.products.edit"] },
  "product-performance": { path: "/api/product-performance", params: ["product_ids", "days"], permissions: ["reports.dashboard", "stock.products.view"] },
  "inventory": { path: "/api/inventory", params: ["page", "size", "outlet_id", "q", "negative_only"], permissions: ["reports.dashboard", "stock.inventory.view", "stock.products.view"] },
  "sales": { path: "/api/sales", params: ["from", "to", "page", "size", "snapshot_id"], permissions: ["reports.dashboard"] },
  "sales-trend": { path: "/api/reports/sales-trend", params: ["from", "to"], permissions: ["reports.dashboard"] },
  "daily-sales": { path: "/api/reports/daily-sales", params: ["report_date"], permissions: ["reports.dashboard"] },
  "report-sales": { path: "/api/source-reports/sales", params: ["from", "to", "dashboard", "size"], permissions: ["reports.dashboard"] },
  "report-inventory": { path: "/api/source-reports/inventory", params: ["page", "size", "q", "negative_only"], permissions: ["reports.dashboard", "stock.inventory.view", "stock.products.view"] },
  "dashboard-inventory": { path: "/api/dashboard/inventory", params: [], permissions: ["reports.dashboard", "stock.inventory.view", "stock.products.view"] },
  "report-purchase": { path: "/api/source-reports/purchase", params: ["from", "to", "page", "size", "q"], permissions: ["reports.dashboard", "purchase.orders.view", "stock.purchases.view"] },
  "report-products": { path: "/api/source-reports/products", params: ["page", "size", "q", "status", "brand", "category", "family", "tag", "supplier", "type", "tax_rate", "cost_tax_rate", "gift_card"], permissions: ["reports.dashboard", "stock.products.view", "stock.products.edit"] },
  "purchase-orders": { path: "/api/purchase-orders", params: ["page", "size", "status", "q"], permissions: ["reports.dashboard", "purchase.orders.view", "stock.purchases.view"] },
  "coverage": { path: "/api/sync/coverage", params: [], permissions: ["reports.dashboard", "stock.inventory.view", "stock.products.view"] },
};

function responseError(error: unknown) {
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 502;
  const message = error instanceof Error ? error.message : "Shopfront source data is unavailable.";
  return NextResponse.json({ message }, { status: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) throw new StoreAccessError("Cross-origin requests are not allowed", 403);
    const resource = request.nextUrl.searchParams.get("resource") ?? "";
    const endpoint = ENDPOINTS[resource];
    if (!endpoint) return NextResponse.json({ message: "Unknown Shopfront source view." }, { status: 400 });

    await requirePermission(request, ...endpoint.permissions);
    const store = verifiedShopfrontSourceStoreFromHost(request.headers.get("x-forwarded-host") || request.headers.get("host"));
    if (!store) return NextResponse.json({ message: "Shopfront source is not mapped to this store." }, { status: 409 });

    const base = (process.env.SHOPFRONT_CRAWLER_URL || "https://crawler.orithos.com.au").trim().replace(/\/+$/, "");
    const integrationToken = (process.env.SHOPFRONT_INTEGRATION_TOKEN || process.env.APP_SHOPFRONT_INTEGRATION_TOKEN || "").trim();
    if (!integrationToken) {
      return NextResponse.json({ message: "Shopfront source access is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const target = new URL(endpoint.path, `${base}/`);
    target.searchParams.set("store", store);
    for (const name of endpoint.params) {
      const value = request.nextUrl.searchParams.get(name);
      if (value !== null) target.searchParams.set(name, value);
    }

    const upstream = await fetch(target, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${integrationToken}` },
      signal: AbortSignal.timeout(resource.startsWith("report-") || resource === "dashboard-inventory" ? 90_000 : 15_000),
    });
    if (!upstream.ok) {
      const bodyText = await upstream.text().catch(() => "");
      let detail = "";
      try {
        const parsed = JSON.parse(bodyText) as { detail?: unknown; message?: unknown };
        if (typeof parsed.detail === "string") detail = parsed.detail;
        else if (typeof parsed.message === "string") detail = parsed.message;
      } catch { /* plain-text upstream body */ }
      if (!detail && bodyText && bodyText.length < 240) detail = bodyText;
      const base = upstream.status === 401
        ? "Shopfront crawler authorization failed. Set the same SHOPFRONT_INTEGRATION_TOKEN on POS and crawler."
        : upstream.status >= 500
          ? "Shopfront source service is temporarily unavailable."
          : "Shopfront source request was rejected.";
      const message = detail && !detail.includes(integrationToken) ? `${base} (${detail})` : base;
      return NextResponse.json({ message, upstreamStatus: upstream.status }, { status: upstream.status >= 500 ? 503 : upstream.status, headers: { "Cache-Control": "no-store" } });
    }
    return new NextResponse(await upstream.text(), {
      status: 200,
      headers: { "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return responseError(error);
  }
}
