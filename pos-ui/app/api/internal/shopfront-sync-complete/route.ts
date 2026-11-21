import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { clearReportingCache } from "@/lib/reporting-dashboard-cache";
import { recordShopfrontSyncForHost } from "@/lib/shopfront-sync-registry";
import { applyShopfrontSyncNotification, shopfrontSyncHostsForTargets } from "@/lib/shopfront-sync-notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  let hosts: string[];
  try {
    hosts = shopfrontSyncHostsForTargets(
      String(body.storeKey),
      Object.prototype.hasOwnProperty.call(body, "targetStoreKeys") ? body.targetStoreKeys : undefined,
    );
  } catch {
    return NextResponse.json({ message: "Invalid sync target stores" }, { status: 400 });
  }
  const coverageStart = new Date(`${body.toDay}T00:00:00.000Z`);
  coverageStart.setUTCDate(coverageStart.getUTCDate() - 179);
  const earliestCoveredDay = coverageStart.toISOString().slice(0, 10);
  const coverageRanges = body.coverageRanges ?? [{ fromDay: body.fromDay, toDay: body.toDay }];
  if (!Array.isArray(coverageRanges) || coverageRanges.length > 512
    || coverageRanges.some((range) => !range || typeof range !== "object"
      || !day(range.fromDay) || !day(range.toDay)
      || String(range.fromDay) > String(range.toDay)
      || String(range.fromDay) < earliestCoveredDay
      || String(range.toDay) > String(body.toDay))) {
    return NextResponse.json({ message: "Invalid sync coverage ranges" }, { status: 400 });
  }

  try {
    if (!hosts.length) return NextResponse.json({ message: "No Orithos stores are configured for this Shopfront source" }, { status: 503 });
    await applyShopfrontSyncNotification({
      status: body.status as "completed" | "partial" | "failed",
      hosts,
      at: Date.now(),
      coverageRanges: coverageRanges as Array<{ fromDay: string; toDay: string }>,
      latestThroughDay: String(body.toDay),
      record: recordShopfrontSyncForHost,
      clear: clearReportingCache,
    });
    return NextResponse.json({ accepted: true, stores: hosts.length, status: body.status });
  } catch {
    return NextResponse.json({ message: "Report refresh could not be recorded" }, { status: 503 });
  }
}
