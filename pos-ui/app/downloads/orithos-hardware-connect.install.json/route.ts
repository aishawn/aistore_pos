import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { ORITHOS_HC_OFFICIAL_WINDOWS_URL } from "@/lib/hardware-connect-download";

export async function GET() {
  const host = (await headers()).get("x-forwarded-host") ?? (await headers()).get("host");
  const proto = (await headers()).get("x-forwarded-proto") ?? "https";
  const settingsUrl =
    host && !host.includes("localhost")
      ? `${proto}://${host.split(",")[0]?.trim()}/settings/hardware`
      : "https://skr.orithos.com.au/settings/hardware";

  return NextResponse.json(
    {
      product: "Orithos Hardware Connect",
      version: "1.1.3.0",
      settingsUrl,
      setupFileName: "OrithosHardwareConnect-Setup.exe",
      setupDownloadUrl: ORITHOS_HC_OFFICIAL_WINDOWS_URL,
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}