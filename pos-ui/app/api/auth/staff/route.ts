import { NextRequest, NextResponse } from "next/server";
import { authProxyError, backendUrl, isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return authProxyError("Cross-origin staff lookup is not allowed", 403);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim()
    || request.headers.get("host");
  const tenantSlug = forwardedHost?.match(/^([a-z0-9-]+)\.orithos\.com\.au(?::\d+)?$/i)?.[1];
  if (!tenantSlug || ["www", "app", "api", "odoo", "cdn", "support", "mail", "status"].includes(tenantSlug.toLowerCase())) {
    return authProxyError("Staff selection is available on a store login page", 400);
  }
  try {
    const response = await fetch(`${backendUrl().replace(/\/+$/, "")}/api/auth/staff`, {
      headers: {
        "X-Forwarded-Host": forwardedHost!,
        "X-Orithos-Tenant-Slug": tenantSlug,
        ...(request.headers.get("x-forwarded-proto")
          ? { "X-Forwarded-Proto": request.headers.get("x-forwarded-proto")! }
          : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return authProxyError("Authentication service is unavailable", 502);
  }
}
