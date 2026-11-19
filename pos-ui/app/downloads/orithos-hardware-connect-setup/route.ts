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
  const external = externalDownloadUrl();
  if (external) {
    return NextResponse.redirect(external);
  }

  const bundled = await serveBundledSetup();
  if (bundled) {
    return bundled;
  }

  return new NextResponse("Orithos Hardware Connect setup is not on this server yet.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function HEAD() {
  const external = externalDownloadUrl();
  if (external) {
    return new NextResponse(null, { status: 307, headers: { Location: external } });
  }

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

  return new NextResponse(null, { status: 503 });
}