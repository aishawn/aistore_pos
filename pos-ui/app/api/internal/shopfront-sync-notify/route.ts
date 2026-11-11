import { NextRequest, NextResponse } from "next/server";
import { shopfrontSyncStampForHost } from "@/lib/shopfront-sync-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_HOSTS: Record<string, string[]> = {
  skr: ["skr.orithos.com.au", "demo.orithos.com.au"],
};

export async function GET(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
  const host = (forwardedHost || request.nextUrl.host).split(":")[0].toLowerCase();
  if (!Object.values(STORE_HOSTS).flat().includes(host)) {
    return NextResponse.json({ message: "Unknown store host." }, { status: 404 });
  }
  const at = await shopfrontSyncStampForHost(host);
  return NextResponse.json({ at }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
