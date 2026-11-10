import { NextRequest, NextResponse } from "next/server";
import { isControlPlanePageAllowed, parseTenantSlugFromHost } from "@/lib/tenant-host";

const ACCESS_COOKIE = "orithos_access_token";
const REFRESH_COOKIE = "orithos_refresh_token";
const NO_STORE_PAGES = new Set([
  "/security",
  "/reports/favourites",
  "/settings/company/general",
  "/settings/company/login-after-sale",
  "/settings/company/search",
  "/settings/data",
  "/settings/loyalty",
  "/settings/push",
  "/settings/receipts",
  "/settings/surcharging",
  "/settings/transferees",
  "/utilities/barcodes",
  "/utilities/customers",
  "/utilities/future-costs",
  "/utilities/future-prices",
  "/utilities/mail-log",
  "/utilities/products",
  "/utilities/trashed-items",
  "/products",
  "/promotion/categories",
  "/promotions",
  "/settings/pricesets",
  "/settings/roles",
  "/settings/users",
  "/utilities/vendor-connections",
  "/platform/stores",
  "/close",
  "/history",
  "/reports/dashboard",
  "/reports/closures",
  "/reports/daily-sales",
  "/reports/last-month-sales",
  "/reports/last-week-sales",
  "/reports/this-month-sales",
  "/reports/weekly-sales",
  "/stock/replenishment",
  "/stock/price-suggestions",
  "/settings/company/date-time",
]);

const NO_STORE_PAGE_PREFIXES = ["/platform/stores/", "/reports/closures/"];

/** Routes that must stay reachable without a session. */
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/auth/bootstrap",
  "/forgot-password",
  "/reset-password",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/reset-token",
  "/api/auth/bootstrap",
  "/api/public",
  "/enapi.json",
  "/openapi.json",
];

function isPublic(pathname: string): boolean {
  if (pathname.startsWith("/_next") || pathname.startsWith("/images") || pathname === "/favicon.ico") {
    return true;
  }
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function withSecurityHeaders(response: NextResponse, tenantSlug: string | null): NextResponse {
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Voice input uses getUserMedia on the current store origin. Keep unrelated
  // device capabilities disabled while allowing the assistant microphone.
  response.headers.set("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  if (tenantSlug) {
    response.headers.set("x-orithos-tenant-slug", tenantSlug);
  }
  return response;
}

function withPageCachePolicy(response: NextResponse, pathname: string): NextResponse {
  // Routers and reverse proxies may preserve a trailing slash. Normalize it
  // before applying the live-data cache policy so both URL forms are safe.
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (NO_STORE_PAGES.has(normalizedPath) || NO_STORE_PAGE_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) {
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("CDN-Cache-Control", "no-store");
    response.headers.set("Vercel-CDN-Cache-Control", "no-store");
  }
  return response;
}

function withHeaders(response: NextResponse, tenantSlug: string | null, pathname: string, correlationId: string): NextResponse {
  response.headers.set("X-Correlation-ID", correlationId);
  return withPageCachePolicy(withSecurityHeaders(response, tenantSlug), pathname);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const incomingCorrelationId = request.headers.get("x-correlation-id") || "";
  const correlationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(incomingCorrelationId)
    ? incomingCorrelationId
    : crypto.randomUUID();
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const tenantSlug = parseTenantSlugFromHost(host);
  const localPreview = process.env.NODE_ENV === "development"
    && request.cookies.get("orithos_local_preview")?.value === "1";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-correlation-id", correlationId);
  if (tenantSlug) {
    requestHeaders.set("x-orithos-tenant-slug", tenantSlug);
  }
  if (host) {
    requestHeaders.set("x-forwarded-host", host.split(",")[0].trim());
  }

  if (isPublic(pathname)) {
    return withHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      tenantSlug,
      pathname,
      correlationId,
    );
  }

  // Retired `/api/odoo/*` catch-all returns 410 from the route handler.
  // API routes other than public auth still need a token; the BFF returns 401.
  // Only page navigations are redirected here.
  if (pathname.startsWith("/api/")) {
    return withHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      tenantSlug,
      pathname,
      correlationId,
    );
  }

  // Local preview uses localhost/127.0.0.1 with a fixture cookie. Do not
  // apply control-plane host routing to that development-only session.
  const onControlPlane = tenantSlug === null && !localPreview;
  if (onControlPlane && !isControlPlanePageAllowed(pathname)) {
    const consoleHome = request.nextUrl.clone();
    consoleHome.pathname = "/platform/stores";
    consoleHome.search = "";
    return withHeaders(NextResponse.redirect(consoleHome), tenantSlug, pathname, correlationId);
  }

  const hasSession =
    Boolean(request.cookies.get(ACCESS_COOKIE)?.value)
    || Boolean(request.cookies.get(REFRESH_COOKIE)?.value);
  if (!hasSession && !localPreview) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    const nextPath = onControlPlane
      ? "/platform/stores"
      : `${pathname}${request.nextUrl.search}`;
    login.search = `?next=${encodeURIComponent(nextPath)}`;
    return withHeaders(NextResponse.redirect(login), tenantSlug, pathname, correlationId);
  }

  return withHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    tenantSlug,
    pathname,
    correlationId,
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
