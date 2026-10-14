import { NextRequest, NextResponse } from "next/server";
import { hasOrithosSession } from "@/lib/server-auth";

const ACCESS_COOKIE = "orithos_access_token";
const REFRESH_COOKIE = "orithos_refresh_token";

/** Routes that must stay reachable without a session. */
const PUBLIC_PREFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/reset-token",
];

function isPublic(pathname: string): boolean {
  if (pathname.startsWith("/_next") || pathname.startsWith("/images") || pathname === "/favicon.ico") {
    return true;
  }
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return withSecurityHeaders(NextResponse.next());

  if (pathname.startsWith("/api/odoo/") && pathname !== "/api/odoo/session" && !(await hasOrithosSession(request))) {
    return withSecurityHeaders(NextResponse.json({ message: "Orithos session expired" }, { status: 401 }));
  }

  // API routes other than public auth still need a token, but the BFF returns 401;
  // only page navigations are redirected here.
  if (pathname.startsWith("/api/")) return withSecurityHeaders(NextResponse.next());

  const hasSession =
    Boolean(request.cookies.get(ACCESS_COOKIE)?.value)
    || Boolean(request.cookies.get(REFRESH_COOKIE)?.value);

  if (!hasSession) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
    return withSecurityHeaders(NextResponse.redirect(login));
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
