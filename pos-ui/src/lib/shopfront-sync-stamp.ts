const STORAGE_KEY = "orithos-shopfront-sync-at-v1";
const COOKIE_NAME = "orithos_shopfront_sync_at";

export function readShopfrontSyncStamp(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const fromStorage = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(fromStorage) && fromStorage > 0) return fromStorage;
  } catch { /* ignore */ }
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
    const fromCookie = match ? Number(decodeURIComponent(match[1])) : NaN;
    if (Number.isFinite(fromCookie) && fromCookie > 0) return fromCookie;
  } catch { /* ignore */ }
  return null;
}

export function writeShopfrontSyncStamp(at: number) {
  if (typeof window === "undefined" || !Number.isFinite(at)) return;
  const previous = readShopfrontSyncStamp();
  if (previous !== null && at <= previous) return;
  try { localStorage.setItem(STORAGE_KEY, String(at)); } catch { /* ignore */ }
  try {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(String(at))}; path=/; max-age=86400; samesite=lax`;
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("orithos-shopfront-sync", { detail: { at } }));
}

export async function fetchShopfrontSyncStamp(): Promise<number | null> {
  try {
    const response = await fetch("/api/shopfront/sync-stamp", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return null;
    const payload = await response.json() as { at?: unknown };
    const at = Number(payload.at);
    if (!Number.isFinite(at) || at <= 0) return null;
    writeShopfrontSyncStamp(at);
    return at;
  } catch {
    return null;
  }
}
