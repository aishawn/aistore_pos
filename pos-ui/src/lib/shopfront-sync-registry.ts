import { reportRedis, REPORT_PREFIX } from "./report-snapshots.ts";

const STAMP_TTL_SECONDS = 90 * 86400;
const stamps = new Map<string, number>();

function hostKey(host: string) {
  return host.trim().toLowerCase();
}

export async function recordShopfrontSyncForHost(host: string, at = Date.now()) {
  const key = hostKey(host);
  if (!key) return;
  stamps.set(key, at);
  const client = await reportRedis();
  if (!client) return;
  const keyForHost = `${REPORT_PREFIX}sync-stamp:${key}`;
  const keyGlobal = `${REPORT_PREFIX}sync-stamp:global`;
  try {
    await client.eval(`
      local previous = tonumber(redis.call('GET', KEYS[2]) or '0')
      local current = tonumber(ARGV[1])
      if current > previous then redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2]) end
      redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
      return 1
    `, { keys: [keyForHost, keyGlobal], arguments: [String(at), String(STAMP_TTL_SECONDS)] });
  } catch {
    // Keep the process-local stamp as a fallback when Redis is temporarily unavailable.
  }
}

export async function shopfrontSyncStampForHost(host: string): Promise<number | null> {
  const key = hostKey(host);
  if (!key) return null;
  const client = await reportRedis();
  if (client) {
    try {
      const value = await client.get(`${REPORT_PREFIX}sync-stamp:${key}`);
      if (value && Number.isFinite(Number(value))) return Number(value);
    } catch {
      // Fall back to the latest stamp held by this process.
    }
  }
  return stamps.get(key) ?? null;
}

export async function shopfrontSyncStampGlobal(): Promise<number | null> {
  const client = await reportRedis();
  if (client) {
    try {
      const value = await client.get(`${REPORT_PREFIX}sync-stamp:global`);
      if (value && Number.isFinite(Number(value))) return Number(value);
    } catch {
      // Fall back to the latest stamp held by this process.
    }
  }
  if (!stamps.size) return null;
  return Math.max(...stamps.values());
}
