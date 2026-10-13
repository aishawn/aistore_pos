import { NextRequest, NextResponse } from "next/server";
import { authProxyError, isSameOrigin, postAuthBackend } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return authProxyError("Cross-origin password reset is not allowed", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return authProxyError("Invalid password reset request", 400);
  }
  try {
    const upstream = await postAuthBackend("forgot-password", body);
    const payload = await upstream.json().catch(() => null);
    if (!payload) return authProxyError("Authentication service returned an invalid response", 502);
    return NextResponse.json(payload, { status: upstream.status });
  } catch {
    return authProxyError("Authentication service is unavailable", 502);
  }
}
