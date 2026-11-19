/** Public download URL for the Windows Hardware Connect bundle (Shopfront-style installer entry). */
export function getOrithosHardwareConnectDownloadUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_ORITHOS_HC_DOWNLOAD_URL?.trim();
  if (configured) return configured;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/downloads/orithos-hardware-connect-latest.zip`;
  }
  return null;
}