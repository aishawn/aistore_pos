import { NextRequest, NextResponse } from "next/server";

export const REFRESH_COOKIE = "orithos_refresh_token";
export const ACCESS_COOKIE = "orithos_access_token";
const REFRESH_MAX_AGE = 365 * 24 * 60 * 60;

export function isSameOrigin(request: NextRequest) {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return true;

  let origin: string;
  try {
    origin = new URL(originHeader).origin;
  } catch {
    return false;
  }

  const requestUrl = new URL(request.url);
  // Behind Dokploy/Cloudflare, Next may see the internal HTTP URL while the
  // browser sends the public HTTPS origin. Prefer the proxy's public host and
  // protocol headers, then fall back to the direct request URL.
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
  const host = forwardedHost || request.headers.get("host") || requestUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = forwardedProto || requestUrl.protocol.slice(0, -1);
  const externalOrigin = `${protocol}://${host}`;

  return origin === externalOrigin || origin === requestUrl.origin;
}

export function backendUrl() {
  return process.env.BACKEND_URL?.trim()
    || process.env.NEXT_PUBLIC_API_BASE_URL?.trim()
    || "http://localhost:8080";
}

export async function hasOrithosSession(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return false;

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim()
    || request.headers.get("host");
  const tenantSlug = request.headers.get("x-orithos-tenant-slug")
    || forwardedHost?.match(/^([a-z0-9-]+)\.orithos\.com\.au(?::\d+)?$/i)?.[1];
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (forwardedHost) headers["X-Forwarded-Host"] = forwardedHost;
  if (tenantSlug) headers["X-Orithos-Tenant-Slug"] = tenantSlug;

  try {
    const response = await fetch(`${backendUrl().replace(/\/+$/, "")}/api/auth/me`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { code?: number; data?: unknown };
    return payload.code === 0 && Boolean(payload.data);
  } catch {
    return false;
  }
}

export async function postAuthBackend(
  path: string,
  body?: unknown,
  authorization?: string | null,
  forwardFrom?: NextRequest | null,
) {
  const base = backendUrl().replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(authorization ? { Authorization: authorization } : {}),
  };
  if (forwardFrom) {
    const forwardedHost = forwardFrom.headers.get("x-forwarded-host")?.split(",")[0].trim()
      || forwardFrom.headers.get("host");
    if (forwardedHost) headers["X-Forwarded-Host"] = forwardedHost;
    const tenantSlug = forwardFrom.headers.get("x-orithos-tenant-slug")
      || forwardedHost?.match(/^([a-z0-9-]+)\.orithos\.com\.au(?::\d+)?$/i)?.[1];
    if (tenantSlug) headers["X-Orithos-Tenant-Slug"] = tenantSlug;
    const forwardedProto = forwardFrom.headers.get("x-forwarded-proto")?.split(",")[0].trim();
    if (forwardedProto) headers["X-Forwarded-Proto"] = forwardedProto;
    const forwardedFor = forwardFrom.headers.get("x-forwarded-for");
    if (forwardedFor) headers["X-Forwarded-For"] = forwardedFor;
  }
  let backendBody = body;
  if (path === "login" && body && typeof body === "object" && !Array.isArray(body)) {
    const forwardedHost = forwardFrom?.headers.get("x-forwarded-host")?.split(",")[0].trim()
      || forwardFrom?.headers.get("host")
      || "";
    const slug = forwardFrom?.headers.get("x-orithos-tenant-slug")
      || forwardedHost.match(/^([a-z0-9-]+)\.orithos\.com\.au(?::\d+)?$/i)?.[1];
    if (slug && !["www", "app", "api", "odoo", "cdn", "support", "mail", "status"].includes(slug.toLowerCase())) {
      backendBody = { ...(body as Record<string, unknown>), subdomain: (body as Record<string, unknown>).subdomain || slug };
    }
  }
  return fetch(`${base}/api/auth/${path}`, {
    method: "POST",
    headers,
    body: backendBody === undefined ? undefined : JSON.stringify(backendBody),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

export function setRefreshCookie(response: NextResponse, token: string | null) {
  response.cookies.set(REFRESH_COOKIE, token ?? "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    // Path `/` so middleware can detect a recoverable session after access expiry.
    path: "/",
    maxAge: token ? REFRESH_MAX_AGE : 0,
  });
}

export function setAccessCookie(response: NextResponse, token: string | null, maxAge = 2 * 60 * 60) {
  response.cookies.set(ACCESS_COOKIE, token ?? "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: token ? maxAge : 0,
  });
}

export function clearAuthCookies(response: NextResponse) {
  setAccessCookie(response, null);
  setRefreshCookie(response, null);
  // Expire legacy path-scoped cookies from earlier releases.
  response.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, path: "/api", maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { httpOnly: true, path: "/api/auth", maxAge: 0 });
}

const TRANSIENT_AUTH_HTTP = new Set([408, 425, 429, 502, 503, 504]);

/** Clear cookies only on definitive auth failure, not during deploy/gateway blips. */
export function authFailureShouldClearSession(status: number, code: unknown): boolean {
  if (TRANSIENT_AUTH_HTTP.has(status)) return false;
  if (status === 401) return true;
  const numeric = typeof code === "number" ? code : NaN;
  return numeric === 40100 || numeric === 40102 || numeric === 40103 || numeric === 40323;
}

export async function respondWithAuthTokens(backendResponse: Response, clearOnFailure = false) {
  let payload: Record<string, unknown>;
  try {
    payload = await backendResponse.json() as Record<string, unknown>;
  } catch {
    const response = NextResponse.json({ code: 50200, message: "Authentication service returned an invalid response", data: null }, { status: 502 });
    return response;
  }

  let refreshToken: string | null = null;
  let accessToken: string | null = null;
  let accessMaxAge = 2 * 60 * 60;
  const data = payload.data;
  if (backendResponse.ok && payload.code === 0 && data && typeof data === "object") {
    const tokenResponse = data as Record<string, unknown>;
    if (typeof tokenResponse.refreshToken === "string") refreshToken = tokenResponse.refreshToken;
    if (typeof tokenResponse.accessToken === "string") accessToken = tokenResponse.accessToken;
    if (typeof tokenResponse.expiresIn === "number" && Number.isFinite(tokenResponse.expiresIn)) {
      accessMaxAge = Math.max(1, Math.floor(tokenResponse.expiresIn));
    }
    delete tokenResponse.refreshToken;
    delete tokenResponse.accessToken;
  }

  const response = NextResponse.json(payload, { status: backendResponse.status });
  if (accessToken) setAccessCookie(response, accessToken, accessMaxAge);
  if (refreshToken) setRefreshCookie(response, refreshToken);
  else if (clearOnFailure && authFailureShouldClearSession(backendResponse.status, payload.code)) {
    clearAuthCookies(response);
  }
  return response;
}

export function authProxyError(message: string, status = 502) {
  return NextResponse.json({ code: status === 401 ? 40103 : 50200, message, data: null }, { status });
}
