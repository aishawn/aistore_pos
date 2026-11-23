import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { ORITHOS_HC_OFFICIAL_WINDOWS_URL } from "@/lib/hardware-connect-download";

function externalDownloadUrl(): string {
  const direct = process.env.ORITHOS_HC_DOWNLOAD_URL?.trim();
  if (direct) return direct;
  const bundle = process.env.ORITHOS_HC_BUNDLE_URL?.trim();
  if (bundle) return bundle;
  return ORITHOS_HC_OFFICIAL_WINDOWS_URL;
}

async function serveBundledSetup() {
  const candidates = [
    path.join(process.cwd(), "public", "downloads", "OrithosHardwareConnect-Setup.exe"),
    path.join(process.cwd(), "public", "downloads", "orithos-hardware-connect-setup.exe"),
  ];
  for (const setupPath of candidates) {
    try {
      await access(setupPath);
      const body = await readFile(setupPath);
      return new NextResponse(body, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": 'attachment; filename="OrithosHardwareConnect-Setup.exe"',
          "Cache-Control": "public, max-age=300",
        },
      });
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function GET() {
  const bundled = await serveBundledSetup();
  if (bundled) {
    return bundled;
  }
  return NextResponse.redirect(externalDownloadUrl());
}

export async function HEAD() {
  const bundled = await serveBundledSetup();
  if (bundled) {
    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  const redirect = externalDownloadUrl();
  return new NextResponse(null, { status: 307, headers: { Location: redirect } });
}