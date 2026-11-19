import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export async function GET() {
  const external = process.env.ORITHOS_HC_DOWNLOAD_URL?.trim();
  if (external) {
    return NextResponse.redirect(external);
  }

  const zipPath = path.join(process.cwd(), "public", "downloads", "orithos-hardware-connect-latest.zip");
  try {
    const body = await readFile(zipPath);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="OrithosHardwareConnect-win-x64.zip"',
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "Orithos Hardware Connect installer is not on this server yet.",
        publish: "Run tools/orithos-hardware-connect/stage-ui-download.ps1 or set ORITHOS_HC_DOWNLOAD_URL.",
      },
      { status: 404 },
    );
  }
}