import { NextRequest, NextResponse } from "next/server";

export const REFRESH_COOKIE = "orithos_refresh_token";
const REFRESH_MAX_AGE = 14 * 24 * 60 * 60;

export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function backendUrl() {
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

export async function respondWithAuthTokens(backendResponse: Response, clearOnFailure = false) {
  let payload: Record<string, unknown>;
  try {
    payload = await backendResponse.json() as Record<string, unknown>;
  } catch {
    const response = NextResponse.json({ code: 50200, message: "Authentication service returned an invalid response", data: null }, { status: 502 });
    if (clearOnFailure) setRefreshCookie(response, null);
    return response;
  }

  let refreshToken: string | null = null;
  const data = payload.data;
  if (backendResponse.ok && payload.code === 0 && data && typeof data === "object") {
    const tokenResponse = data as Record<string, unknown>;
    if (typeof tokenResponse.refreshToken === "string") refreshToken = tokenResponse.refreshToken;
    delete tokenResponse.refreshToken;
  }

  const response = NextResponse.json(payload, { status: backendResponse.status });
  if (refreshToken) setRefreshCookie(response, refreshToken);
  else if (clearOnFailure) setRefreshCookie(response, null);
  return response;
}

export function authProxyError(message: string, status = 502) {
  return NextResponse.json({ code: status === 401 ? 40103 : 50200, message, data: null }, { status });
}
