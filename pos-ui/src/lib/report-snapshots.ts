import { createHash, randomUUID } from "node:crypto";
import { createClient } from "redis";
import { getReportPeriodBounds, type ReportQueryPeriod } from "./report-period.ts";
import { salesDate } from "./replenishment-safety.ts";

export const REPORT_PREFIX = "orithos:reports:v1:";
export const SNAPSHOT_TTL = 7 * 86400;
export type SnapshotPeriod = ReportQueryPeriod | "dead_stock";
export type ReportTarget = {
  vendorId: number; companyId: number; host: string; timezone: string;
  database: string; sampleDataClearedAt: string | null;
  shopfrontStore?: string;
};
export type ReportScope = ReportTarget & { uid: number; permissionScope: string };
export type ReportSnapshot = {
  key: string; generatedAt: string; queryThrough: string; revision: string;
  body: Record<string, unknown>; scope: ReportScope; period: SnapshotPeriod;
};
export type ReportJob = {
  id: string; key: string; scope: ReportScope; period: SnapshotPeriod; revision: string;
  requestedAt: string; state: "queued" | "running" | "complete" | "failed";
  attempts: number; error?: string; completedAt?: string;
};

export function reportTargets(env = process.env): ReportTarget[] {
  const values: unknown = JSON.parse(env.REPORT_SNAPSHOT_TARGETS || "[]");
  if (!Array.isArray(values)) throw new Error("REPORT_SNAPSHOT_TARGETS must be an array");
  const seen = new Set<string>();
  return values.map((value) => {
    const row = value as ReportTarget;
    if (!Number.isSafeInteger(row.vendorId) || row.vendorId < 1 || !Number.isSafeInteger(row.companyId) || row.companyId < 1
      || !/^[a-z0-9][a-z0-9.-]*(?::\d+)?$/.test(row.host) || !row.database || row.database !== env.ODOO_DATABASE
      || (row.shopfrontStore != null && !/^[a-z0-9][a-z0-9-]*$/.test(row.shopfrontStore))
      || (row.sampleDataClearedAt != null && !Number.isFinite(Date.parse(row.sampleDataClearedAt)))) throw new Error("Invalid report target scope");
    new Intl.DateTimeFormat("en", { timeZone: row.timezone }).format();
    const identity = `${row.database}:${row.vendorId}:${row.companyId}:${row.host}`;
    if (seen.has(identity)) throw new Error("Duplicate report target");
    seen.add(identity);
    return { ...row, sampleDataClearedAt: row.sampleDataClearedAt ?? null };
  });
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
export function targetId(target: ReportTarget) { return digest([target.database, target.vendorId, target.companyId, target.host]); }
export function snapshotKey(scope: ReportScope, period: SnapshotPeriod, now = new Date()) {
  const bounds = period === "dead_stock" ? null : getReportPeriodBounds(period, now, scope.timezone);
  return digest([scope, period, bounds?.start.toISOString() ?? salesDate(now.toISOString(), scope.timezone),
    period === "today" ? "to-now" : bounds?.end.toISOString() ?? "daily", "report-schema-3-net-inventory"]);
}

const localRevisions = new Map<string, string>();
let connection: Promise<ReturnType<typeof createClient> | null> | null = null;
let unavailableUntil = 0;
export async function reportRedis() {
  const redisUrl = process.env.REPORT_REDIS_URL?.trim();
  if (!redisUrl || Date.now() < unavailableUntil) return null;
  if (!connection) {
    connection = (async () => {
      const client = createClient({
        url: redisUrl,
        database: Number(process.env.REPORT_REDIS_DB || 1),
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

export async function snapshotRevision(target: ReportTarget) {
  const client = await reportRedis();
  try { return client ? await client.get(REPORT_PREFIX + "revision:" + targetId(target)) ?? "0" : localRevisions.get(targetId(target)) ?? "0"; }
  catch { return localRevisions.get(targetId(target)) ?? "0"; }
}

export function reportScheduleDue(period: SnapshotPeriod, timezone: string, startup = false, now = new Date()) {
  if (startup || period === "today") return true;
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  return local >= (period === "dead_stock" ? "02:30" : "00:10");
}

export function snapshotFresh(snapshot: ReportSnapshot, revision: string, now = new Date()) {
  if (snapshot.revision !== revision) return false;
  const generated = new Date(snapshot.generatedAt);
  if (!Number.isFinite(generated.getTime())) return false;
  if (snapshot.period === "today") return now.getTime() - generated.getTime() < 300_000;
  const day = salesDate(now.toISOString(), snapshot.scope.timezone);
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: snapshot.scope.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const generatedLocal = new Intl.DateTimeFormat("en-GB", { timeZone: snapshot.scope.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(generated);
  if (salesDate(generated.toISOString(), snapshot.scope.timezone) !== day) return false;
  const threshold = snapshot.period === "dead_stock" ? "02:30" : local >= "02:00" ? "02:00" : local >= "00:10" ? "00:10" : "00:00";
  return local < threshold || generatedLocal >= threshold;
}

export async function enqueueReport(scope: ReportScope, period: SnapshotPeriod, priority = false, force = false, retryFailed = false) {
  const client = await reportRedis();
  if (!client) return null;
  const key = snapshotKey(scope, period), revision = await snapshotRevision(scope);
  const id = digest([key, revision]);
  const jobKey = REPORT_PREFIX + "job:" + id;
  const job: ReportJob = { id, key, scope, period, revision, requestedAt: new Date().toISOString(), state: "queued", attempts: 0 };
  // Completed jobs may be refreshed; running/queued jobs always coalesce.
  const result = await client.eval(`
    local old = redis.call('GET', KEYS[1])
    if old then
      local job = cjson.decode(old)
      if job.state == 'running' or job.state == 'queued' then
        if ARGV[4] == '1' and job.state == 'queued' then redis.call('ZADD', KEYS[2], ARGV[2], ARGV[3]) end
        return old
      end
      if job.state == 'failed' and ARGV[6] ~= '1' then return old end
      if ARGV[5] ~= '1' and job.state == 'complete' then return old end
    end
    redis.call('SET', KEYS[1], ARGV[1], 'EX', 604800)
    redis.call('ZADD', KEYS[2], ARGV[2], ARGV[3])
    return ARGV[1]
  `, { keys: [jobKey, REPORT_PREFIX + "queue"], arguments: [JSON.stringify(job), String(priority ? 0 : Date.now()), id, priority ? "1" : "0", force ? "1" : "0", retryFailed ? "1" : "0"] });
  return JSON.parse(String(result)) as ReportJob;
}

export async function readSnapshot(scope: ReportScope, period: SnapshotPeriod) {
  const client = await reportRedis();
  if (!client) return null;
  const key = snapshotKey(scope, period);
  const value = await client.get(REPORT_PREFIX + "snapshot:" + key);
  return value ? JSON.parse(value) as ReportSnapshot : null;
}

export async function invalidateReportTarget(target: ReportTarget) {
  if (localRevisions.size >= 256) localRevisions.delete(localRevisions.keys().next().value!);
  const revision = randomUUID();
  localRevisions.set(targetId(target), revision);
  const client = await reportRedis();
  if (!client) return;
  await client.set(REPORT_PREFIX + "revision:" + targetId(target), revision, { EX: SNAPSHOT_TTL });
  const targetKey = REPORT_PREFIX + "target:" + targetId(target);
  const previous = await client.get(targetKey);
  let enriched: Record<string, unknown> = {};
  try { enriched = previous ? JSON.parse(previous) as Record<string, unknown> : {}; } catch { /* Replace malformed cached scope. */ }
  await client.set(targetKey, JSON.stringify({ ...enriched, ...target,
    ...(typeof enriched.uid === "number" ? { uid: enriched.uid } : {}),
    ...(typeof enriched.permissionScope === "string" ? { permissionScope: enriched.permissionScope } : {}) }), { EX: SNAPSHOT_TTL });
}

export type ShopfrontSyncState = {
  fromDay: string; toDay: string; runId: number | null; status: "completed" | "partial" | "failed";
  updatedAt: string; revision: string;
};

export function summarizeShopfrontSyncDays(days: Record<string, ShopfrontSyncState>, fromDay: string, toDay: string): ShopfrontSyncState | null {
  const expected: string[] = [];
  const cursor = new Date(`${fromDay}T12:00:00Z`), end = new Date(`${toDay}T12:00:00Z`);
  for (; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) expected.push(cursor.toISOString().slice(0, 10));
  const covered = expected.flatMap(day => days[day] ? [days[day]] : []);
  if (!covered.length) return null;
  const latest = [...covered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  let contiguousThrough: string | null = null;
  for (const day of expected) {
    if (days[day]?.status !== "completed") break;
    contiguousThrough = day;
  }
  const status = expected.length > 0 && expected.every(day => days[day]?.status === "completed")
    ? "completed" : covered.some(day => day.status === "completed") ? "partial" : latest.status;
  const syncedThrough = contiguousThrough ?? new Date(new Date(`${fromDay}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  return { ...latest, fromDay, toDay: syncedThrough, status };
}

export async function readShopfrontSyncState(target: ReportTarget, fromDay?: string | null, toDay?: string | null): Promise<ShopfrontSyncState | null> {
  const client = await reportRedis();
  if (!client) return null;
  try {
    const raw = await client.get(REPORT_PREFIX + "source-sync:" + targetId(target));
    if (!raw) return null;
    const state = JSON.parse(raw) as ShopfrontSyncState | { days?: Record<string, ShopfrontSyncState> };
    if ("days" in state && state.days) {
      if (fromDay && toDay) return summarizeShopfrontSyncDays(state.days, fromDay, toDay);
      const days: ShopfrontSyncState[] = Object.values(state.days);
      if (!days.length) return null;
      const latest = [...days].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      const completed = days.filter(day => day.status === "completed");
      const min = days.reduce((value, day) => day.fromDay < value ? day.fromDay : value, latest.fromDay);
      const max = completed.length ? completed.reduce((value, day) => day.toDay > value ? day.toDay : value, completed[0].toDay) : latest.toDay;
      const cursor = new Date(`${min}T12:00:00Z`), end = new Date(`${max}T12:00:00Z`);
      let hasGap = false;
      for (; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) if (!state.days![cursor.toISOString().slice(0, 10)]) hasGap = true;
      return { ...latest, fromDay: min, toDay: max,
        status: !hasGap && days.every(day => day.status === "completed") ? "completed" : completed.length ? "partial" : latest.status };
    }
    return state as ShopfrontSyncState;
  } catch { return null; }
}

export async function recordShopfrontSync(target: ReportTarget, state: Omit<ShopfrontSyncState, "updatedAt" | "revision">) {
  await invalidateReportTarget(target);
  const client = await reportRedis();
  if (!client) throw new Error("Report cache is unavailable");
  const revision = await snapshotRevision(target);
  const key = REPORT_PREFIX + "source-sync:" + targetId(target);
  const previous = await client.get(key);
  const saved: { days: Record<string, ShopfrontSyncState> } = { days: {} };
  try {
    const parsed = previous ? JSON.parse(previous) as { days?: Record<string, ShopfrontSyncState> } : null;
    if (parsed?.days) saved.days = parsed.days;
  } catch { /* Start a fresh per-day ledger when the cached value is malformed. */ }
  const updatedAt = new Date().toISOString();
  const from = new Date(`${state.fromDay}T12:00:00Z`), to = new Date(`${state.toDay}T12:00:00Z`);
  for (const day = new Date(from); day <= to; day.setUTCDate(day.getUTCDate() + 1)) {
    const businessDay = day.toISOString().slice(0, 10);
    const old = saved.days[businessDay];
    saved.days[businessDay] = { ...state, fromDay: businessDay, toDay: businessDay, status: state.status,
      runId: state.runId ?? old?.runId ?? null, revision, updatedAt };
  }
  // Keep source completeness as audit state; report snapshot TTL is independent.
  await client.set(key, JSON.stringify(saved));
  const targetKey = REPORT_PREFIX + "target:" + targetId(target);
  const rawTarget = await client.get(targetKey);
  if (rawTarget) {
    const scope = JSON.parse(rawTarget) as ReportScope;
    if (typeof scope.uid === "number" && typeof scope.permissionScope === "string") {
      await Promise.all((['yesterday', 'last_week'] as const).map(period => enqueueReport(scope, period, true, true, true)));
    }
  }
}
