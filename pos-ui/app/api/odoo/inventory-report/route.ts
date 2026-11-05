import { NextRequest, NextResponse } from "next/server";
import { reportAccess } from "@/lib/report-request";
import { readShopfrontSyncState } from "@/lib/report-snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { scope, company } = await reportAccess(request);
    const shopfrontSync = scope.shopfrontStore ? await readShopfrontSyncState(scope) : null;
    return NextResponse.json({
      company: company.name,
      timezone: scope.timezone,
      source: "Odoo current inventory snapshot",
      shopfrontSync,
      generatedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 502;
    return NextResponse.json({ message: error instanceof Error ? error.message : "Inventory report metadata is unavailable." }, { status });
  }
}
