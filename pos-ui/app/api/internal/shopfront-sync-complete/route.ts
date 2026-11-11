import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { clearReportingCache } from "@/lib/reporting-dashboard-cache";
import { recordShopfrontSyncForHost } from "@/lib/shopfront-sync-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_TARGET_HOSTS: Record<string, string[]> = {
  skr: ["skr.orithos.com.au", "demo.orithos.com.au"],
};

function equalToken(value: string, expected: string) {
  const a = Buffer.from(value), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expected = process.env.ORITHOS_SHOPFRONT_SYNC_NOTIFY_SECRET?.trim()
    || process.env.APP_SHOPFRONT_INTEGRATION_TOKEN?.trim()
    || process.env.SHOPFRONT_INTEGRATION_TOKEN?.trim()
    || "";
  const supplied = request.headers.get("x-shopfront-integration-token") ?? "";
  if (!expected || !equalToken(supplied, expected)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const day = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  if (!body || body.storeKey !== "skr" || !day(body.fromDay) || !day(body.toDay)
    || String(body.fromDay) > String(body.toDay) || !["completed", "partial", "failed"].includes(String(body.status))
    || (body.syncRunId !== null && body.syncRunId !== undefined && !Number.isSafeInteger(body.syncRunId))) {
    return NextResponse.json({ message: "Invalid sync completion record" }, { status: 400 });
  }

  try {
    const knownHosts = STORE_TARGET_HOSTS[body.storeKey] || [];
    if (!knownHosts.length) return NextResponse.json({ message: "No Orithos stores are configured for this Shopfront source" }, { status: 503 });
    const at = Date.now();
    await Promise.all(knownHosts.map(async host => {
      await recordShopfrontSyncForHost(host, at);
      clearReportingCache(`${host}|`);
    }));
    return NextResponse.json({ accepted: true, stores: knownHosts.length, status: body.status });
  } catch {
    return NextResponse.json({ message: "Report refresh could not be recorded" }, { status: 503 });
  }
}
