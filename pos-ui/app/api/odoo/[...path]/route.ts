import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Browser Odoo BFF retired — store pages read Orithos pos-api only. */
function retired() {
  return NextResponse.json(
    {
      message: "Odoo browser APIs are retired. Use Orithos /api/* ledger routes.",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

export function GET() {
  return retired();
}

export function POST() {
  return retired();
}

export function PUT() {
  return retired();
}

export function PATCH() {
  return retired();
}

export function DELETE() {
  return retired();
}
