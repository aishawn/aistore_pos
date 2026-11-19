/** Same-origin installer: static zip when present, else route (redirect / fallback). */
export function getOrithosHardwareConnectDownloadUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_ORITHOS_HC_DOWNLOAD_URL?.trim();
  if (configured) return configured;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/downloads/orithos-hardware-connect-latest.zip`;
  }
  return null;
}

const HC_ROUTE_PATH = "/downloads/orithos-hardware-connect-latest";

/** True when the response looks like the Windows zip (~1MB minimum). */
export async function probeHardwareConnectDownloadAvailable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (!response.ok) {
      if (url.endsWith(".zip")) {
        const routeUrl = url.replace(/\.zip$/, "");
        const viaRoute = await fetch(routeUrl, { method: "HEAD", cache: "no-store", redirect: "follow" });
        if (!viaRoute.ok) return false;
        const routeType = viaRoute.headers.get("content-type") ?? "";
        return routeType.includes("zip") || routeType.includes("octet-stream");
      }
      return false;
    }
    const type = response.headers.get("content-type") ?? "";
    const len = Number(response.headers.get("content-length") ?? "0");
    if (type.includes("zip") || type.includes("octet-stream")) return len === 0 || len > 500_000;
    if (type.includes("json")) return false;
    return false;
  } catch {
    return false;
  }
}

export { HC_ROUTE_PATH };

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