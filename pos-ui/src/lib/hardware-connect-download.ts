/** Shopfront-style installer entry from Setup → Hardware (same-origin download route). */
export function getOrithosHardwareConnectDownloadUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_ORITHOS_HC_DOWNLOAD_URL?.trim();
  if (configured) return configured;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/downloads/orithos-hardware-connect-latest`;
  }
  return null;
}

export type HardwareConnectReleaseMeta = {
  product: string;
  version: string;
  downloadPath: string;
  stagedAt?: string;
};

export async function fetchHardwareConnectReleaseMeta(): Promise<HardwareConnectReleaseMeta | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch("/downloads/orithos-hardware-connect.version.json", { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as HardwareConnectReleaseMeta;
  } catch {
    return null;
  }
}