import { createClient } from "redis";
import type { ShopfrontSyncCoverageRange } from "./shopfront-sync-notification";

const STAMP_TTL_SECONDS = 90 * 86400;
const COVERAGE_TTL_SECONDS = 180 * 86400;
// Keep the established keys so deployments retain their last sync timestamp.
const PREFIX = "orithos:reports:v1:sync-stamp:";
const THROUGH_PREFIX = "orithos:reports:v1:sync-through:";
const COVERAGE_PREFIX = "orithos:reports:v1:sync-days:";
const stamps = new Map<string, number>();
let connection: Promise<ReturnType<typeof createClient> | null> | null = null;
let unavailableUntil = 0;

function hostKey(host: string) {
  return host.trim().toLowerCase();
}

async function redisClient() {
  const url = process.env.POS_REDIS_URL?.trim();
  if (!url || Date.now() < unavailableUntil) return null;
  if (!connection) {
    connection = (async () => {
      const client = createClient({
        url,
        database: 1,
        socket: { connectTimeout: 1200, reconnectStrategy: false },
        disableOfflineQueue: true,
      });
      client.on("error", () => { connection = null; unavailableUntil = Date.now() + 5000; });
      try { await client.connect(); return client; }
      catch { client.destroy(); connection = null; unavailableUntil = Date.now() + 5000; return null; }
    })();
  }
  return connection;
}

export async function recordShopfrontSyncForHost(
  host: string,
  at: number,
  coverageRanges: ShopfrontSyncCoverageRange[],
  latestThroughDay: string,
) {
  const key = hostKey(host);
  if (!key) return;
  const days = new Set<string>();
  for (const range of coverageRanges) {
    const start = Date.parse(`${range.fromDay}T00:00:00.000Z`);
    const end = Date.parse(`${range.toDay}T00:00:00.000Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) continue;
    for (let day = start; day <= end; day += 86400000) {
      days.add(new Date(day).toISOString().slice(0, 10));
    }
  }
  if (!days.size) return;
  if (!Number.isFinite(Date.parse(`${latestThroughDay}T00:00:00.000Z`))) return;
  stamps.set(key, at);
  const client = await redisClient();
  if (!client) return;
  const keyForHost = `${PREFIX}${key}`;
  const keyGlobal = `${PREFIX}global`;
  const coverageKey = `${COVERAGE_PREFIX}${key}`;
  const throughKey = `${THROUGH_PREFIX}${key}`;
  try {
    await client.eval(`
      local previous = tonumber(redis.call('GET', KEYS[2]) or '0')
      local current = tonumber(ARGV[1])
      if current > previous then redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2]) end
      redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
      redis.call('SET', KEYS[4], ARGV[3], 'EX', ARGV[2])
      if #ARGV > 4 then redis.call('SADD', KEYS[3], unpack(ARGV, 5)) end
      redis.call('EXPIRE', KEYS[3], ARGV[4])
      return 1
    `, {
      keys: [keyForHost, keyGlobal, coverageKey, throughKey],
      arguments: [String(at), String(STAMP_TTL_SECONDS), latestThroughDay,
        String(COVERAGE_TTL_SECONDS), ...days],
    });
  } catch {
    // Only Redis can establish report coverage; a local stamp is UI-only.
  }
}

export async function shopfrontSyncStampForHost(host: string): Promise<number | null> {
  const key = hostKey(host);
  if (!key) return null;
  const client = await redisClient();
  if (client) {
    try {
      const value = await client.get(`${PREFIX}${key}`);
      if (value && Number.isFinite(Number(value))) return Number(value);
    } catch {
      // Fall back to the latest stamp held by this process.
    }
  }
  return stamps.get(key) ?? null;
}

export async function shopfrontSyncStampGlobal(): Promise<number | null> {
  const client = await redisClient();
  if (client) {
    try {
      const value = await client.get(`${PREFIX}global`);
      if (value && Number.isFinite(Number(value))) return Number(value);
    } catch {
      // Fall back to the latest stamp held by this process.
    }
  }
  if (!stamps.size) return null;
  return Math.max(...stamps.values());
}
