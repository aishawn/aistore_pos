import { NextRequest, NextResponse } from "next/server";
import { clearReportingCache } from "@/lib/reporting-dashboard-cache";
import { invalidateReportTarget, reportTargets } from "@/lib/report-snapshots";
import { recordShopfrontSyncForHost } from "@/lib/shopfront-sync-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_HOSTS: Record<string, string[]> = {
  skr: ["skr.orithos.com.au", "demo.orithos.com.au"],
};

function notifySecret() {
  return process.env.ORITHOS_SHOPFRONT_SYNC_NOTIFY_SECRET?.trim() || "";
}

export async function POST(request: NextRequest) {
  const expected = notifySecret();
  if (!expected) return NextResponse.json({ message: "Notify is not configured." }, { status: 503 });
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${expected}`) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  let body: { storeKey?: string; hosts?: string[]; syncedAt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON." }, { status: 400 });
  }
  const storeKey = String(body.storeKey || "").trim().toLowerCase();
  if (!storeKey) return NextResponse.json({ message: "storeKey is required." }, { status: 400 });

  const hosts = (Array.isArray(body.hosts) ? body.hosts : STORE_HOSTS[storeKey] || [])
    .map((host) => String(host).trim().toLowerCase())
    .filter(Boolean);
  const at = Number.isFinite(Date.parse(String(body.syncedAt || ""))) ? Date.parse(String(body.syncedAt)) : Date.now();

  for (const host of hosts) {
    recordShopfrontSyncForHost(host, at);
    clearReportingCache(`${host}|`);
  }
  for (const target of reportTargets()) {
    if (hosts.includes(target.host.toLowerCase())) {
      await invalidateReportTarget(target).catch(() => undefined);
    }
  }

  return NextResponse.json({ ok: true, at, hosts }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
