import { NextRequest, NextResponse } from "next/server";
import { authProxyError, backendUrl, isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return authProxyError("Cross-origin password reset is not allowed", 403);
  }

  const token = request.nextUrl.searchParams.get("token")?.trim();
  const purpose = request.nextUrl.searchParams.get("purpose") ?? "reset";
  if (!token || !/^[a-f0-9]{64}$/i.test(token) || !["reset", "invite"].includes(purpose)) {
    return authProxyError("This link is invalid or has expired", 400);
  }

  const base = backendUrl().replace(/\/+$/, "");
  const upstreamUrl = new URL(`${base}/api/auth/reset-token`);
  upstreamUrl.searchParams.set("token", token);
  upstreamUrl.searchParams.set("purpose", purpose);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await upstream.json().catch(() => null);
    if (!payload) {
      return authProxyError("Authentication service returned an invalid response", 502);
    }
    return NextResponse.json(payload, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return authProxyError("Authentication service is unavailable", 502);
  }
}
