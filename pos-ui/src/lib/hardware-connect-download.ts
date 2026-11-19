/** Published Windows one-click setup (public GitHub release). */
export const ORITHOS_HC_OFFICIAL_WINDOWS_URL =
  "https://github.com/aishawn/aistore_pos/releases/download/hardware-connect-latest/OrithosHardwareConnect-1.1.0-win-x64-Setup.exe";

const HC_SETUP_ROUTE_PATH = "/downloads/orithos-hardware-connect-setup";
const HC_ONECLICK_ROUTE_PATH = "/downloads/orithos-hardware-connect-oneclick";

function sameOriginSetupRouteUrl(): string | null {
  if (typeof window === "undefined") return null;
  return `${window.location.origin}${HC_SETUP_ROUTE_PATH}`;
}

function sameOriginOneClickRouteUrl(): string | null {
  if (typeof window === "undefined") return null;
  return `${window.location.origin}${HC_ONECLICK_ROUTE_PATH}`;
}

/** Same-origin setup route first; optional build-time override. */
export function getOrithosHardwareConnectDownloadUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_ORITHOS_HC_DOWNLOAD_URL?.trim();
  if (configured) return configured;
  return sameOriginSetupRouteUrl();
}

export function getOrithosHardwareConnectOneClickUrl(): string | null {
  return sameOriginOneClickRouteUrl();
}

async function probeSameOriginInstaller(routeUrl: string): Promise<boolean> {
  const response = await fetch(routeUrl, { method: "HEAD", cache: "no-store", redirect: "manual" });
  if (response.status === 307 || response.status === 302 || response.status === 308) {
    return Boolean(response.headers.get("location")?.trim());
  }
  if (!response.ok) return false;
  const type = response.headers.get("content-type") ?? "";
  const len = Number(response.headers.get("content-length") ?? "0");
  if (type.includes("zip") || type.includes("octet-stream") || type.includes("application/x-msdownload")) {
    return len === 0 || len > 500_000;
  }
  return false;
}

/** Best setup file for this register: site route, redirect target, or official GitHub release. */
export async function resolveHardwareConnectDownloadHref(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_ORITHOS_HC_DOWNLOAD_URL?.trim();
  if (configured) return configured;
  const routeUrl = sameOriginSetupRouteUrl();
  if (routeUrl) {
    try {
      const response = await fetch(routeUrl, { method: "HEAD", cache: "no-store", redirect: "manual" });
      if (response.status === 307 || response.status === 302 || response.status === 308) {
        const location = response.headers.get("location")?.trim();
        if (location) return location;
      }
      if (response.ok) {
        const type = response.headers.get("content-type") ?? "";
        if (type.includes("octet-stream") || type.includes("zip") || type.includes("application/x-msdownload")) {
          return routeUrl;
        }
      }
    } catch {
      /* fall through */
    }
  }
  return ORITHOS_HC_OFFICIAL_WINDOWS_URL;
}

/** True when the installer is reachable from this site (hosted file or configured redirect). */
export async function probeHardwareConnectDownloadAvailable(url: string): Promise<boolean> {
  try {
    const routeUrl = sameOriginSetupRouteUrl();
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
    if (type.includes("zip") || type.includes("octet-stream") || type.includes("application/x-msdownload")) {
      return len === 0 || len > 500_000;
    }
    return false;
  } catch {
    return false;
  }
}

export { HC_SETUP_ROUTE_PATH, HC_ONECLICK_ROUTE_PATH };

export type HardwareConnectReleaseMeta = {
  product: string;
  version: string;
  downloadPath: string;
  stagedAt?: string;
  settingsUrl?: string;
  setupFileName?: string;
};

export async function fetchHardwareConnectReleaseMeta(): Promise<HardwareConnectReleaseMeta | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch("/downloads/orithos-hardware-connect.install.json", { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as HardwareConnectReleaseMeta;
  } catch {
    return null;
  }
}