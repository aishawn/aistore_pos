import { NextRequest, NextResponse } from "next/server";
import { shopfrontSyncStampForHost, shopfrontSyncStampGlobal } from "@/lib/shopfront-sync-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim().toLowerCase();
  const at = (host ? shopfrontSyncStampForHost(host) : null) ?? shopfrontSyncStampGlobal();
  return NextResponse.json({ at }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
