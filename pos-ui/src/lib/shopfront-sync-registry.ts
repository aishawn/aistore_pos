const stamps = new Map<string, number>();

export function recordShopfrontSyncForHost(host: string, at = Date.now()) {
  const key = host.trim().toLowerCase();
  if (!key) return;
  stamps.set(key, at);
}

export function shopfrontSyncStampForHost(host: string): number | null {
  const key = host.trim().toLowerCase();
  return stamps.get(key) ?? null;
}

export function shopfrontSyncStampGlobal(): number | null {
  if (!stamps.size) return null;
  return Math.max(...stamps.values());
}
