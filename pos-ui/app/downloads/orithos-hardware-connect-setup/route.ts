import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  ORITHOS_HC_LEGACY_FALLBACK_URL,
  ORITHOS_HC_OFFICIAL_WINDOWS_URL,
} from "@/lib/hardware-connect-download";

function externalDownloadUrl(): string | null {
  const direct = process.env.ORITHOS_HC_DOWNLOAD_URL?.trim();
  if (direct) return direct;
  const bundle = process.env.ORITHOS_HC_BUNDLE_URL?.trim();
  if (bundle) return bundle;
  return null;
}

async function probeHttpDownload(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store", redirect: "follow" });
    if (!response.ok) return false;
    const type = response.headers.get("content-type") ?? "";
    const len = Number(response.headers.get("content-length") ?? "0");
    if (type.includes("zip") || type.includes("octet-stream") || type.includes("application/x-msdownload")) {
      return len === 0 || len > 500_000;
    }
    return false;
  } catch {
    return false;
  }
}

async function resolveExternalDownloadRedirect(): Promise<string | null> {
  const configured = externalDownloadUrl();
  const candidates = [
    ...(configured ? [configured] : []),
    ORITHOS_HC_OFFICIAL_WINDOWS_URL,
    ORITHOS_HC_LEGACY_FALLBACK_URL,
  ];
  for (const url of candidates) {
    if (await probeHttpDownload(url)) return url;
  }
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
  const bundled = await serveBundledSetup();
  if (bundled) {
    return bundled;
  }

  const redirect = await resolveExternalDownloadRedirect();
  if (redirect) {
    return NextResponse.redirect(redirect);
  }

  return new NextResponse("Orithos Hardware Connect installer is not on this server yet.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
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

  const redirect = await resolveExternalDownloadRedirect();
  if (redirect) {
    return new NextResponse(null, { status: 307, headers: { Location: redirect } });
  }

  return new NextResponse(null, { status: 503 });
}