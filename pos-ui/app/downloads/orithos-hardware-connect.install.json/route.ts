import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { chooseHardwareConnectSetupUrl } from "@/lib/hardware-connect-download";

let setupVerificationCache: {
  size: number;
  modifiedAt: number;
  digest: Promise<string>;
} | null = null;

type StagedHardwareConnectMeta = {
  product?: string;
  version?: string;
  stagedAt?: string;
  setupSha256?: string;
  bundleSha256?: string;
};

async function readStagedMeta(): Promise<StagedHardwareConnectMeta> {
  const metadataPath = path.join(process.cwd(), "public", "downloads", "orithos-hardware-connect.version.json");
  try {
    return JSON.parse(await readFile(metadataPath, "utf8")) as StagedHardwareConnectMeta;
  } catch {
    return {};
  }
}

async function hasVerifiedBundledSetup(expectedSha256?: string): Promise<boolean> {
  if (!expectedSha256 || !/^[a-f0-9]{64}$/i.test(expectedSha256)) return false;
  try {
    const setupPath = path.join(process.cwd(), "public", "downloads", "OrithosHardwareConnect-Setup.exe");
    const fileInfo = await stat(setupPath);
    if (!fileInfo.isFile()) return false;

    if (
      !setupVerificationCache ||
      setupVerificationCache.size !== fileInfo.size ||
      setupVerificationCache.modifiedAt !== fileInfo.mtimeMs
    ) {
      const digest = (async () => {
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(setupPath)) hash.update(chunk);
        return hash.digest("hex");
      })();
      setupVerificationCache = { size: fileInfo.size, modifiedAt: fileInfo.mtimeMs, digest };
    }

    const actualSha256 = await setupVerificationCache.digest;
    return actualSha256.toLowerCase() === expectedSha256.toLowerCase();
  } catch {
    return false;
  }
}

export async function GET() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  const staged = await readStagedMeta();
  const bundledSetup = await hasVerifiedBundledSetup(staged.setupSha256);
  const settingsUrl =
    host && !host.includes("localhost")
      ? `${proto}://${host.split(",")[0]?.trim()}/settings/hardware`
      : "https://skr.orithos.com.au/settings/hardware";
  const setupDownloadUrl = chooseHardwareConnectSetupUrl(process.env.ORITHOS_HC_DOWNLOAD_URL, bundledSetup);

  return NextResponse.json(
    {
      product: staged.product || "Orithos Hardware Connect",
      version: staged.version || "unknown",
      downloadPath: "/downloads/orithos-hardware-connect-setup",
      settingsUrl,
      setupFileName: "OrithosHardwareConnect-Setup.exe",
      setupDownloadUrl,
      ...(staged.stagedAt ? { stagedAt: staged.stagedAt } : {}),
      ...(staged.setupSha256 ? { setupSha256: staged.setupSha256 } : {}),
      ...(staged.bundleSha256 ? { bundleSha256: staged.bundleSha256 } : {}),
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
