import { NextRequest } from "next/server";
import { authProxyError, isSameOrigin, postAuthBackend, respondWithAuthTokens } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return authProxyError("Cross-origin login is not allowed", 403);
  let body: unknown;
  try { body = await request.json(); } catch { return authProxyError("Invalid login request", 400); }
  try {
    return await respondWithAuthTokens(await postAuthBackend("login", body));
  } catch {
    return authProxyError("Authentication service is unavailable", 502);
  }
}
