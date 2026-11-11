import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function retired() {
  return NextResponse.json(
    { message: "The legacy Demo reset is retired. Demo data is managed in the Orithos ledger and through crawler sync." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  return retired();
}

export async function POST() {
  return retired();
}
