/** Published Windows x64 installer on GitHub (public; no server env required). */
export const ORITHOS_HC_OFFICIAL_WINDOWS_URL =
  "https://github.com/aishawn/aistore_pos/releases/download/hardware-connect-latest/OrithosHardwareConnect-1.0.0-win-x64.zip";

const HC_ROUTE_PATH = "/downloads/orithos-hardware-connect-latest";

function sameOriginRouteUrl(): string | null {
  if (typeof window === "undefined") return null;
  return `${window.location.origin}${HC_ROUTE_PATH}`;
}

/** Same-origin route first; optional build-time override. */
export function getOrithosHardwareConnectDownloadUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_ORITHOS_HC_DOWNLOAD_URL?.trim();
  if (configured) return configured;
  return sameOriginRouteUrl();
}

async function probeSameOriginInstaller(routeUrl: string): Promise<boolean> {
  const response = await fetch(routeUrl, { method: "HEAD", cache: "no-store", redirect: "manual" });
  if (response.status === 307 || response.status === 302 || response.status === 308) {
    const location = response.headers.get("location")?.trim();
    return Boolean(location);
  }
  if (!response.ok) return false;
  const type = response.headers.get("content-type") ?? "";
  const len = Number(response.headers.get("content-length") ?? "0");
  if (type.includes("zip") || type.includes("octet-stream")) return len === 0 || len > 500_000;
  return false;
}

/** Best download link for this register: site route, redirect target, or official GitHub release. */
export async function resolveHardwareConnectDownloadHref(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_ORITHOS_HC_DOWNLOAD_URL?.trim();
  if (configured) return configured;
  const routeUrl = sameOriginRouteUrl();
  if (routeUrl) {
    try {
      const response = await fetch(routeUrl, { method: "HEAD", cache: "no-store", redirect: "manual" });
      if (response.status === 307 || response.status === 302 || response.status === 308) {
        const location = response.headers.get("location")?.trim();
        if (location) return location;
      }
      if (response.ok) {
        const type = response.headers.get("content-type") ?? "";
        if (type.includes("zip") || type.includes("octet-stream")) return routeUrl;
      }
    } catch {
      /* fall through */
    }
  }
  return ORITHOS_HC_OFFICIAL_WINDOWS_URL;
}

/** True when the installer is reachable from this site (hosted zip or configured redirect). */
export async function probeHardwareConnectDownloadAvailable(url: string): Promise<boolean> {
  try {
    const routeUrl = sameOriginRouteUrl();
    if (routeUrl && (url === routeUrl || url.startsWith(routeUrl))) {
      return probeSameOriginInstaller(routeUrl);
    }
    const response = await fetch(url, { method: "HEAD", cache: "no-store", redirect: "manual" });
    if (response.status === 307 || response.status === 302 || response.status === 308) {
      return Boolean(response.headers.get("location")?.trim());
    }
    if (!response.ok) return false;
    const type = response.headers.get("content-type") ?? "";
    const len = Number(response.headers.get("content-length") ?? "0");
    if (type.includes("zip") || type.includes("octet-stream")) return len === 0 || len > 500_000;
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