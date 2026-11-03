import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { reportRedis, snapshotRevision } from "./report-snapshots";
import type { TenantOdooBinding } from "./odoo-tenant-company";

const values = new Map<string, { expires: number; body: unknown }>();
const pending = new Map<string, Promise<unknown>>();
const REDIS_READ_PREFIX = "orithos:reads:v1:";
const LOCAL_READ_TTL_MS = 5 * 60 * 1000;

type ScopedReadCacheOptions = {
  persistentTtlMs?: number;
  maxPersistentBytes?: number;
  identityScope?: string | number;
  onCacheHit?: () => void;
};

/** Call only after current authentication, authorization and company resolution. */
export async function scopedReadCache<T>(request: NextRequest, binding: TenantOdooBinding, parameters: unknown, run: () => Promise<T>, options: ScopedReadCacheOptions = {}): Promise<T> {
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host).split(",")[0].trim().toLowerCase();
  const revision = await snapshotRevision({ database: process.env.ODOO_DATABASE || "unconfigured", vendorId: binding.vendorId, companyId: binding.odooCompanyId!, host, timezone: "UTC", sampleDataClearedAt: binding.sampleDataClearedAt ?? null });
  const identity = options.identityScope === undefined
    ? [request.cookies.get("orithos_odoo_session")?.value, request.cookies.get("orithos_access_token")?.value]
    : ["verified-identity", options.identityScope];
  const key = createHash("sha256").update(JSON.stringify([process.env.ODOO_DATABASE, host, identity,
    binding.vendorId, binding.odooCompanyId, binding.sampleDataClearedAt, parameters, revision])).digest("hex");
  const force = request.nextUrl.searchParams.get("refresh") === "true" || request.nextUrl.searchParams.get("validateSales") === "true";
  const old = values.get(key);
  if (!force && old && old.expires > Date.now()) {
    options.onCacheHit?.();
    return old.body as T;
  }
  if (!force && options.persistentTtlMs) {
    try {
      const redis = await reportRedis();
      const serialized = redis ? await redis.get(REDIS_READ_PREFIX + key) : null;
      if (serialized) {
        const cached = JSON.parse(serialized) as T;
        if (values.size >= 128) values.delete(values.keys().next().value!);
        values.set(key, { body: cached, expires: Date.now() + LOCAL_READ_TTL_MS });
        options.onCacheHit?.();
        return cached;
      }
    } catch {
      // Redis is an optimization; a miss or outage falls through to Odoo.
    }
  }
  let flight = pending.get(key);
  if (!flight) {
    flight = run().then(async body => {
      if (values.size >= 128) values.delete(values.keys().next().value!);
      const canCache = request.nextUrl.searchParams.get("validateSales") !== "true";
      if (canCache) values.set(key, { body, expires: Date.now() + LOCAL_READ_TTL_MS });
      if (canCache && options.persistentTtlMs) {
        try {
          const redis = await reportRedis();
          if (redis) {
            const serialized = JSON.stringify(body);
            if (Buffer.byteLength(serialized) <= (options.maxPersistentBytes ?? 8 * 1024 * 1024)) {
              await redis.set(REDIS_READ_PREFIX + key, serialized, {
                EX: Math.max(1, Math.ceil(options.persistentTtlMs / 1000)),
              });
            }
          }
        } catch {
          // Cache writes must never turn a successful Odoo read into a failure.
        }
      }
      return body;
    }).finally(() => pending.delete(key));
    pending.set(key, flight);
  }
  return await flight as T;
}
