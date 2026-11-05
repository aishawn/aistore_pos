import { NextRequest, NextResponse } from "next/server";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { isSameOrigin } from "@/lib/server-auth";
import { verifiedShopfrontSourceStoreFromHost } from "@/lib/shopfront-store-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINTS: Record<string, { path: string; params: string[]; permissions: string[] }> = {
  "products": { path: "/api/products", params: ["page", "size", "catalog_only", "status", "q"], permissions: ["reports.dashboard", "stock.products.view", "stock.products.edit"] },
  "inventory": { path: "/api/inventory", params: ["page", "size", "outlet_id", "q", "negative_only"], permissions: ["reports.dashboard", "stock.inventory.view", "stock.products.view"] },
  "sales": { path: "/api/sales", params: ["from", "to", "page", "size", "snapshot_id"], permissions: ["reports.dashboard"] },
  "sales-trend": { path: "/api/reports/sales-trend", params: ["from", "to"], permissions: ["reports.dashboard"] },
  "daily-sales": { path: "/api/reports/daily-sales", params: ["report_date"], permissions: ["reports.dashboard"] },
  "report-sales": { path: "/api/source-reports/sales", params: ["from", "to", "dashboard"], permissions: ["reports.dashboard"] },
  "report-inventory": { path: "/api/source-reports/inventory", params: ["page", "size", "q", "negative_only"], permissions: ["reports.dashboard", "stock.inventory.view", "stock.products.view"] },
  "report-purchase": { path: "/api/source-reports/purchase", params: ["from", "to", "q"], permissions: ["reports.dashboard", "purchase.orders.view", "stock.purchases.view"] },
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

    const base = (process.env.SHOPFRONT_CRAWLER_URL || "http://shopfront-crawler:8000").trim().replace(/\/+$/, "");
    const usesSourceReport = resource.startsWith("report-");
    const integrationToken = process.env.SHOPFRONT_INTEGRATION_TOKEN?.trim();
    if (usesSourceReport && !integrationToken) {
      return NextResponse.json({ message: "Shopfront source reporting is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const target = new URL(endpoint.path, `${base}/`);
    target.searchParams.set("store", store);
    for (const name of endpoint.params) {
      const value = request.nextUrl.searchParams.get(name);
      if (value !== null) target.searchParams.set(name, value);
    }

    const upstream = await fetch(target, {
      cache: "no-store",
      headers: usesSourceReport ? { Authorization: `Bearer ${integrationToken}` } : undefined,
      signal: AbortSignal.timeout(usesSourceReport ? 90_000 : 15_000),
    });
    if (!upstream.ok) {
      return NextResponse.json({ message: upstream.status >= 500 ? "Shopfront source service is temporarily unavailable." : "Shopfront source request was rejected." }, { status: upstream.status >= 500 ? 503 : upstream.status, headers: { "Cache-Control": "no-store" } });
    }
    return new NextResponse(await upstream.text(), {
      status: 200,
      headers: { "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return responseError(error);
  }
}
