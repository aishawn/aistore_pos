import { NextRequest, NextResponse } from "next/server";
import { hasOrithosSession } from "@/lib/server-auth";
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
  "/history/odoo",
  "/register/odoo",
  "/purchases/odoo",
  "/reports/dashboard",
  "/reports/closures",
  "/reports/daily-sales",
  "/reports/last-month-sales",
  "/reports/last-week-sales",
  "/reports/this-month-sales",
  "/reports/weekly-sales",
  "/stock/replenishment",
  "/stock/price-suggestions",
  "/customers/odoo",
  "/suppliers/odoo",
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

function withHeaders(response: NextResponse, tenantSlug: string | null, pathname: string): NextResponse {
  return withPageCachePolicy(withSecurityHeaders(response, tenantSlug), pathname);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const tenantSlug = parseTenantSlugFromHost(host);

  const requestHeaders = new Headers(request.headers);
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
    );
  }

  if (pathname.startsWith("/api/odoo/") && pathname !== "/api/odoo/session" && !(await hasOrithosSession(request))) {
    return withHeaders(
      NextResponse.json({ message: "Orithos session expired" }, { status: 401 }),
      tenantSlug,
      pathname,
    );
  }

  // API routes other than public auth still need a token, but the BFF returns 401;
  // only page navigations are redirected here.
  if (pathname.startsWith("/api/")) {
    return withHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      tenantSlug,
      pathname,
    );
  }

  const onControlPlane = tenantSlug === null;
  if (onControlPlane && !isControlPlanePageAllowed(pathname)) {
    const consoleHome = request.nextUrl.clone();
    consoleHome.pathname = "/platform/stores";
    consoleHome.search = "";
    return withHeaders(NextResponse.redirect(consoleHome), tenantSlug, pathname);
  }

  const hasSession =
    Boolean(request.cookies.get(ACCESS_COOKIE)?.value)
    || Boolean(request.cookies.get(REFRESH_COOKIE)?.value);

  if (!hasSession) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    const nextPath = onControlPlane
      ? "/platform/stores"
      : `${pathname}${request.nextUrl.search}`;
    login.search = `?next=${encodeURIComponent(nextPath)}`;
    return withHeaders(NextResponse.redirect(login), tenantSlug, pathname);
  }

  return withHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    tenantSlug,
    pathname,
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
