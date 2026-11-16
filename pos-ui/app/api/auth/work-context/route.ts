import { NextRequest } from "next/server";
import { ACCESS_COOKIE, authProxyError, isSameOrigin, postAuthBackend, respondWithAuthTokens } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return authProxyError("Cross-origin work context changes are not allowed", 403);
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return authProxyError("Your session has expired. Please sign in again.", 401);
  let body: unknown;
  try { body = await request.json(); } catch { return authProxyError("Invalid work context request", 400); }
  try {
    return await respondWithAuthTokens(
      await postAuthBackend("work-context", body, `Bearer ${accessToken}`),
    );
  } catch {
    return authProxyError("Authentication service is unavailable", 502);
  }
}