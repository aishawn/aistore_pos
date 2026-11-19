import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

function externalDownloadUrl(): string | null {
  const direct = process.env.ORITHOS_HC_DOWNLOAD_URL?.trim();
  if (direct) return direct;
  const bundle = process.env.ORITHOS_HC_BUNDLE_URL?.trim();
  if (bundle) return bundle;
  return null;
}

async function serveBundledZip() {
  const zipPath = path.join(process.cwd(), "public", "downloads", "orithos-hardware-connect-latest.zip");
  const body = await readFile(zipPath);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="OrithosHardwareConnect-win-x64.zip"',
      "Cache-Control": "public, max-age=300",
    },
  });
}

export async function GET() {
  const external = externalDownloadUrl();
  if (external) {
    return NextResponse.redirect(external);
  }

  try {
    return await serveBundledZip();
  } catch {
    return new NextResponse("Orithos Hardware Connect installer is not on this server yet.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

export async function HEAD() {
  const external = externalDownloadUrl();
  if (external) {
    return new NextResponse(null, { status: 307, headers: { Location: external } });
  }

  const zipPath = path.join(process.cwd(), "public", "downloads", "orithos-hardware-connect-latest.zip");
  try {
    await access(zipPath);
    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}