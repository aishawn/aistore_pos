import { NextRequest, NextResponse } from "next/server";

export const REFRESH_COOKIE = "orithos_refresh_token";
export const ACCESS_COOKIE = "orithos_access_token";
const REFRESH_MAX_AGE = 14 * 24 * 60 * 60;

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

export async function postAuthBackend(path: string, body?: unknown, authorization?: string | null) {
  const base = backendUrl().replace(/\/+$/, "");
  return fetch(`${base}/api/auth/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

export function setRefreshCookie(response: NextResponse, token: string | null) {
  response.cookies.set(REFRESH_COOKIE, token ?? "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
    maxAge: token ? REFRESH_MAX_AGE : 0,
  });
}

export function setAccessCookie(response: NextResponse, token: string | null, maxAge = 2 * 60 * 60) {
  response.cookies.set(ACCESS_COOKIE, token ?? "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api",
    maxAge: token ? maxAge : 0,
  });
}

export function clearAuthCookies(response: NextResponse) {
  setAccessCookie(response, null);
  setRefreshCookie(response, null);
}

export async function respondWithAuthTokens(backendResponse: Response, clearOnFailure = false) {
  let payload: Record<string, unknown>;
  try {
    payload = await backendResponse.json() as Record<string, unknown>;
  } catch {
    const response = NextResponse.json({ code: 50200, message: "Authentication service returned an invalid response", data: null }, { status: 502 });
    if (clearOnFailure) clearAuthCookies(response);
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
  else if (clearOnFailure) clearAuthCookies(response);
  return response;
}

export function authProxyError(message: string, status = 502) {
  return NextResponse.json({ code: status === 401 ? 40103 : 50200, message, data: null }, { status });
}
