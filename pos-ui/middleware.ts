import { NextRequest, NextResponse } from "next/server";
import { hasOrithosSession } from "@/lib/server-auth";
import { isControlPlanePageAllowed, parseTenantSlugFromHost } from "@/lib/tenant-host";

const ACCESS_COOKIE = "orithos_access_token";
const REFRESH_COOKIE = "orithos_refresh_token";

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
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (tenantSlug) {
    response.headers.set("x-orithos-tenant-slug", tenantSlug);
  }
  return response;
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
    return withSecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      tenantSlug,
    );
  }

  if (pathname.startsWith("/api/odoo/") && pathname !== "/api/odoo/session" && !(await hasOrithosSession(request))) {
    return withSecurityHeaders(
      NextResponse.json({ message: "Orithos session expired" }, { status: 401 }),
      tenantSlug,
    );
  }

  // API routes other than public auth still need a token, but the BFF returns 401;
  // only page navigations are redirected here.
  if (pathname.startsWith("/api/")) {
    return withSecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      tenantSlug,
    );
  }

  const onControlPlane = tenantSlug === null;
  if (onControlPlane && !isControlPlanePageAllowed(pathname)) {
    const consoleHome = request.nextUrl.clone();
    consoleHome.pathname = "/platform/stores";
    consoleHome.search = "";
    return withSecurityHeaders(NextResponse.redirect(consoleHome), tenantSlug);
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
    return withSecurityHeaders(NextResponse.redirect(login), tenantSlug);
  }

  return withSecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    tenantSlug,
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
