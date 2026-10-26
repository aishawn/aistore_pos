import { NextRequest } from "next/server";
import { authProxyError, isSameOrigin, postAuthBackend, respondWithAuthTokens } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return authProxyError("Cross-origin login is not allowed", 403);
  let body: unknown;
  try { body = await request.json(); } catch { return authProxyError("Invalid login request", 400); }
  try {
    const hostname = request.nextUrl.hostname.toLowerCase();
    const tenantMatch = hostname.match(/^([a-z0-9-]+)\.orithos\.com\.au$/i);
    const tenantSlug = tenantMatch?.[1];
    const backendBody = tenantSlug && !["www", "app", "api", "odoo", "cdn", "support", "mail", "status"].includes(tenantSlug)
      && body && typeof body === "object" && !Array.isArray(body)
      ? { ...(body as Record<string, unknown>), subdomain: (body as Record<string, unknown>).subdomain || tenantSlug }
      : body;
    return await respondWithAuthTokens(await postAuthBackend("login", backendBody, null, request));
  } catch {
    return authProxyError("Authentication service is unavailable", 502);
  }
}
