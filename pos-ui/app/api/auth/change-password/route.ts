import { NextRequest } from "next/server";
import { ACCESS_COOKIE, authProxyError, isSameOrigin, postAuthBackend, respondWithAuthTokens } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return authProxyError("Cross-origin password changes are not allowed", 403);
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return authProxyError("Your session has expired. Please sign in again.", 401);
  let body: unknown;
  try { body = await request.json(); } catch { return authProxyError("Invalid password change request", 400); }
  try {
    // Preserve the signed-in session when the old password is wrong. The
    // backend issues and stores a replacement refresh token only on success.
    return await respondWithAuthTokens(await postAuthBackend("change-password", body, `Bearer ${accessToken}`));
  } catch {
    return authProxyError("Authentication service is unavailable", 502);
  }
}
