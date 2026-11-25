import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { NextResponse } from "next/server";
import { ORITHOS_HC_OFFICIAL_WINDOWS_URL } from "@/lib/hardware-connect-download";

let setupVerificationCache: {
  path: string;
  size: number;
  modifiedAt: number;
  digest: Promise<string>;
} | null = null;

function externalDownloadUrl(): string {
  const direct = process.env.ORITHOS_HC_DOWNLOAD_URL?.trim();
  if (direct) return direct;
  const bundle = process.env.ORITHOS_HC_BUNDLE_URL?.trim();
  if (bundle) return bundle;
  return ORITHOS_HC_OFFICIAL_WINDOWS_URL;
}

async function findVerifiedBundledSetup(): Promise<{ path: string; size: number } | null> {
  const metadataPath = path.join(process.cwd(), "public", "downloads", "orithos-hardware-connect.version.json");
  const candidates = [
    path.join(process.cwd(), "public", "downloads", "OrithosHardwareConnect-Setup.exe"),
    path.join(process.cwd(), "public", "downloads", "orithos-hardware-connect-setup.exe"),
  ];
  let metadata: { setupSha256?: string };
  try {
    metadata = JSON.parse(await readFile(metadataPath, "utf8")) as { setupSha256?: string };
  } catch {
    return null;
  }
  if (!metadata.setupSha256 || !/^[a-f0-9]{64}$/i.test(metadata.setupSha256)) return null;

  for (const setupPath of candidates) {
    try {
      const fileInfo = await stat(setupPath);
      if (!fileInfo.isFile()) continue;
      if (
        !setupVerificationCache ||
        setupVerificationCache.path !== setupPath ||
        setupVerificationCache.size !== fileInfo.size ||
        setupVerificationCache.modifiedAt !== fileInfo.mtimeMs
      ) {
        const digest = (async () => {
          const hash = createHash("sha256");
          for await (const chunk of createReadStream(setupPath)) hash.update(chunk);
          return hash.digest("hex");
        })();
        setupVerificationCache = { path: setupPath, size: fileInfo.size, modifiedAt: fileInfo.mtimeMs, digest };
      }
      const actualSha256 = await setupVerificationCache.digest;
      if (actualSha256.toLowerCase() !== metadata.setupSha256.toLowerCase()) continue;
      return { path: setupPath, size: fileInfo.size };
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function GET() {
  const bundled = await findVerifiedBundledSetup();
  if (bundled) {
    const body = Readable.toWeb(createReadStream(bundled.path)) as ReadableStream<Uint8Array>;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="OrithosHardwareConnect-Setup.exe"',
        "Content-Length": String(bundled.size),
        "Cache-Control": "public, max-age=300",
      },
    });
  }
  return NextResponse.redirect(externalDownloadUrl());
}

export async function HEAD() {
  const bundled = await findVerifiedBundledSetup();
  if (bundled) {
    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(bundled.size),
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  const redirect = externalDownloadUrl();
  return new NextResponse(null, { status: 307, headers: { Location: redirect } });
}
