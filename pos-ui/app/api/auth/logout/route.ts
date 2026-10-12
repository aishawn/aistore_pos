import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, postAuthBackend, REFRESH_COOKIE, respondWithAuthTokens, setRefreshCookie } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function isUnauthorized(response: Response) {
  if (response.status === 401) return true;
  const payload = await response.clone().json().catch(() => null) as { code?: number } | null;
  return payload?.code === 40100 || payload?.code === 40103;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    const rejected = NextResponse.json({ code: 40300, message: "Cross-origin logout is not allowed", data: null }, { status: 403 });
    setRefreshCookie(rejected, null);
    return rejected;
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  let authorization = request.headers.get("authorization");
  try {
    let logoutResponse = authorization
      ? await postAuthBackend("logout", undefined, authorization)
      : null;

    if ((!logoutResponse || await isUnauthorized(logoutResponse)) && refreshToken) {
      const refreshResponse = await postAuthBackend("refresh", { refreshToken });
      const refreshed = await respondWithAuthTokens(refreshResponse, true);
      const body = await refreshed.clone().json().catch(() => null) as { code?: number; data?: { accessToken?: string } } | null;
      if (refreshed.ok && body?.code === 0 && body.data?.accessToken) {
        authorization = `Bearer ${body.data.accessToken}`;
        logoutResponse = await postAuthBackend("logout", undefined, authorization);
      }
    }

    // Clear the browser session even if the backend is unreachable. The user
    // can always sign in again; the backend refresh token is also revoked
    // whenever its service is reachable.
    const response = logoutResponse && logoutResponse.ok
      ? await respondWithAuthTokens(logoutResponse, true)
      : NextResponse.json({ code: 0, message: "ok", data: null }, { status: 200 });
    setRefreshCookie(response, null);
    return response;
  } catch {
    const response = NextResponse.json({ code: 0, message: "ok", data: null }, { status: 200 });
    setRefreshCookie(response, null);
    return response;
  }
}
