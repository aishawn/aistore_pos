import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retired: browser pages must read Orithos pos-api only. Shopfront ingest
 * remains on the crawler → `/api/integrations/shopfront/*` path.
 */
export async function GET() {
  return NextResponse.json(
    {
      message: "Shopfront source browser reads are retired. Use Orithos /api/reports/* and catalogue APIs.",
      replacement: "/api/reports/native-overview",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
