import { NextRequest } from "next/server";
import { readSettingsImportStatus, triggerSettingsImport } from "@/lib/shopfront-settings-import-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return readSettingsImportStatus(request);
}

export async function POST(request: NextRequest) {
  return triggerSettingsImport(request);
}
