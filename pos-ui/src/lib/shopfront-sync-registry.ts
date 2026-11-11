import { createClient } from "redis";

const STAMP_TTL_SECONDS = 90 * 86400;
// Keep the established keys so deployments retain their last sync timestamp.
const PREFIX = "orithos:reports:v1:sync-stamp:";
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

export async function recordShopfrontSyncForHost(host: string, at = Date.now()) {
  const key = hostKey(host);
  if (!key) return;
  stamps.set(key, at);
  const client = await redisClient();
  if (!client) return;
  const keyForHost = `${PREFIX}${key}`;
  const keyGlobal = `${PREFIX}global`;
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
