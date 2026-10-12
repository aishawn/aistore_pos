import { NextRequest } from "next/server";
import { authProxyError, isSameOrigin, postAuthBackend, REFRESH_COOKIE, respondWithAuthTokens } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return authProxyError("Cross-origin refresh is not allowed", 403);
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return authProxyError("Your session has expired. Please sign in again.", 401);
  try {
    return await respondWithAuthTokens(await postAuthBackend("refresh", { refreshToken }), true);
  } catch {
    return authProxyError("Authentication service is unavailable", 502);
  }
}
