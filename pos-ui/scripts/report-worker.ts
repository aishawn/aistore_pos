import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { calculateReport } from "../src/lib/report-data.ts";
import { calculateDeadStock } from "../src/lib/dead-stock-data.ts";
import { companyReportRpc, readReportCompany, reportEnvelope } from "../src/lib/report-odoo.ts";
import { getOdooAllowedCompanyIds, resolveOdooAllowedCompanyIds } from "../src/lib/odoo-companies.ts";
import {
  REPORT_PREFIX, SNAPSHOT_TTL, enqueueReport, readSnapshot, reportRedis, reportTargets, snapshotFresh,
  snapshotKey, snapshotRevision, reportScheduleDue, targetId, type ReportJob, type ReportScope, type ReportSnapshot, type ReportTarget, type SnapshotPeriod,
} from "../src/lib/report-snapshots.ts";

const targets = reportTargets();
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
let session: { id: string; uid: number; allowed: number[]; expires: number } | null = null;
async function serviceSession() {
  if (session && session.expires > Date.now()) return session;
  if (!process.env.ODOO_SERVICE_USERNAME || !process.env.ODOO_SERVICE_PASSWORD) throw new Error("Report service credentials are missing");
  const auth = await reportEnvelope<{ uid?: number }>("/web/session/authenticate", null, {
    db: process.env.ODOO_DATABASE, login: process.env.ODOO_SERVICE_USERNAME, password: process.env.ODOO_SERVICE_PASSWORD,
  });
  if (!auth.result.uid || !auth.cookie) throw new Error("Report service authentication failed");
  const info = await reportEnvelope<{ uid?: number; db?: string }>("/web/session/get_session_info", auth.cookie, {});
  if (info.result.db !== process.env.ODOO_DATABASE || info.result.uid !== auth.result.uid) throw new Error("Report service database mismatch");
  const allowed = getOdooAllowedCompanyIds(info.result);
  session = { id: auth.cookie, uid: auth.result.uid, allowed: allowed.length ? allowed : await resolveOdooAllowedCompanyIds(auth.cookie, info.result), expires: Date.now() + 20 * 60_000 };
  return session;
}

async function schedule(target: ReportTarget, startup: boolean) {
  const client = await reportRedis();
  if (!client) return;
  const auth = await serviceSession();
  if (!auth.allowed.includes(target.companyId)) throw new Error("Report target company is unauthorized");
  const company = await readReportCompany(companyReportRpc(target.companyId), auth.id, target.companyId);
  if (company.timezone !== target.timezone) throw new Error("Report target timezone does not match Odoo");
  const id = targetId(target);
  const override = await client.get(REPORT_PREFIX + "target:" + id);
  const latest = override ? JSON.parse(override) as ReportTarget : target;
  if (targetId(latest) !== id || latest.timezone !== target.timezone) throw new Error("Report target binding mismatch");
  const scope: ReportScope = { ...target, sampleDataClearedAt: latest.sampleDataClearedAt, uid: auth.uid, permissionScope: "company-admin" };
  await client.set(REPORT_PREFIX + "identity:" + id, String(auth.uid), { EX: 120 });
  const revision = await snapshotRevision(scope);
  for (const period of ["today", "yesterday", "last_week", "last_month", "dead_stock"] as SnapshotPeriod[]) {
    if (!reportScheduleDue(period, target.timezone, startup)) continue;
    const old = await readSnapshot(scope, period);
    if (!old || !snapshotFresh(old, revision)) await enqueueReport(scope, period, false, true);
  }
}

async function processJob(job: ReportJob) {
  const client = await reportRedis();
  if (!client) return false;
  const target = targets.find(t => targetId(t) === targetId(job.scope));
  if (!target || job.scope.permissionScope !== "company-admin" || job.scope.timezone !== target.timezone) {
    await client.zRem(REPORT_PREFIX + "queue", job.id); return false;
  }
  if (job.key !== snapshotKey(job.scope, job.period) || await snapshotRevision(job.scope) !== job.revision) {
    await client.set(REPORT_PREFIX + "job:" + job.id, JSON.stringify({ ...job, state: "failed", error: "REPORT_SUPERSEDED" }), { EX: SNAPSHOT_TTL });
    await client.zRem(REPORT_PREFIX + "queue", job.id); return true;
  }
  const token = randomUUID(), lease = 90_000;
  const storeLock = REPORT_PREFIX + "store-lock:" + targetId(target);
  const jobLock = REPORT_PREFIX + "job-lock:" + job.id;
  let slot = "";
  for (let i = 0; i < 2; i++) {
    const globalLock = REPORT_PREFIX + "slot:" + i;
    const claimed = await client.eval(`
      if redis.call('EXISTS', KEYS[1]) + redis.call('EXISTS', KEYS[2]) + redis.call('EXISTS', KEYS[3]) > 0 then return 0 end
      for i=1,3 do redis.call('SET', KEYS[i], ARGV[1], 'PX', ARGV[2]) end
      return 1
    `, { keys: [storeLock, jobLock, globalLock], arguments: [token, String(lease)] });
    if (Number(claimed) === 1) { slot = globalLock; break; }
  }
  if (!slot) return false;
  let ownsLease = true;
  const lockKeys = [storeLock, jobLock, slot];
  const renew = setInterval(() => {
    void client.eval(`
      for i=1,3 do if redis.call('GET', KEYS[i]) ~= ARGV[1] then return 0 end end
      for i=1,3 do redis.call('PEXPIRE', KEYS[i], ARGV[2]) end
      return 1
    `, { keys: lockKeys, arguments: [token, String(lease)] }).then(value => { if (Number(value) !== 1) ownsLease = false; }).catch(() => { ownsLease = false; });
  }, 20_000);
  const jobKey = REPORT_PREFIX + "job:" + job.id;
  try {
    const raw = await client.get(jobKey);
    if (!raw) return true;
    job = JSON.parse(raw) as ReportJob;
    if (job.state === "complete") { await client.zRem(REPORT_PREFIX + "queue", job.id); return true; }
    job = { ...job, state: "running", attempts: job.attempts + 1 };
    await client.set(jobKey, JSON.stringify(job), { EX: SNAPSHOT_TTL });
    const auth = await serviceSession();
    if (!auth.allowed.includes(target.companyId) || auth.uid !== job.scope.uid || job.key !== snapshotKey(job.scope, job.period)) throw new Error("Report job scope changed");
    const started = performance.now(); let rpcCalls = 0;
    const rpc = companyReportRpc(target.companyId, () => { rpcCalls++; });
    const company = await readReportCompany(rpc, auth.id, target.companyId);
    if (company.timezone !== target.timezone) throw new Error("Report timezone changed");
    const body = job.period === "dead_stock"
      ? await calculateDeadStock(rpc, auth.id, target.companyId, undefined, new Date(), job.scope.sampleDataClearedAt)
      : await calculateReport(rpc, { sessionId: auth.id, companyId: target.companyId, company, period: job.period,
        sampleDataClearedAt: job.scope.sampleDataClearedAt, sourceStore: job.scope.shopfrontStore });
    const now = new Date();
    const snapshot: ReportSnapshot = { key: job.key, scope: job.scope, period: job.period, revision: job.revision,
      generatedAt: now.toISOString(), queryThrough: String("to" in body ? body.to : now.toISOString()),
      body: { ...body, queryMetrics: { rpcCalls, durationMs: Math.round(performance.now() - started) } } };
    // A write or lost lease during calculation prevents publication of an obsolete result.
    if (!ownsLease || job.key !== snapshotKey(job.scope, job.period) || await snapshotRevision(job.scope) !== job.revision) throw new Error("Report result superseded");
    const published = await client.eval(`
      if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
      local revision = redis.call('GET', KEYS[2]) or '0'
      if revision ~= ARGV[2] then return 0 end
      redis.call('SET', KEYS[3], ARGV[3], 'EX', 604800)
      redis.call('SET', KEYS[4], ARGV[4], 'EX', 604800)
      redis.call('ZREM', KEYS[5], ARGV[5])
      return 1
    `, { keys: [jobLock, REPORT_PREFIX + "revision:" + targetId(job.scope), REPORT_PREFIX + "snapshot:" + job.key, jobKey, REPORT_PREFIX + "queue"],
    arguments: [token, job.revision, JSON.stringify(snapshot), JSON.stringify({ ...job, state: "complete", completedAt: now.toISOString(), error: undefined }), job.id] });
    if (Number(published) !== 1) throw new Error("Report publication superseded");
    console.log(JSON.stringify({ event: "report_complete", target: targetId(target), period: job.period, rpcCalls, durationMs: Math.round(performance.now() - started) }));
  } catch {
    session = null;
    if (ownsLease) {
      const delays = [60_000, 300_000, 900_000];
      await client.set(jobKey, JSON.stringify({ ...job, state: "failed", error: "REPORT_PREPARATION_FAILED" }), { EX: SNAPSHOT_TTL });
      await client.zAdd(REPORT_PREFIX + "queue", { score: Date.now() + (delays[job.attempts - 1] ?? 3_600_000), value: job.id });
    }
    console.error(JSON.stringify({ event: "report_failed", target: targetId(target), period: job.period, attempts: job.attempts }));
  } finally {
    clearInterval(renew);
    await client.eval(`for i=1,3 do if redis.call('GET', KEYS[i]) == ARGV[1] then redis.call('DEL', KEYS[i]) end end return 1`, { keys: lockKeys, arguments: [token] }).catch(() => undefined);
  }
  return true;
}

let lastSchedule = 0;
while (!stopping) {
  try {
    const client = await reportRedis();
    if (!client) { await pause(5000); continue; }
    if (Date.now() - lastSchedule >= 60_000) {
      for (const target of targets) {
        try { await schedule(target, lastSchedule === 0); }
        catch { console.error(JSON.stringify({ event: "report_schedule_failed", target: targetId(target) })); }
      }
      lastSchedule = Date.now();
    }
    await writeFile("/tmp/report-worker-heartbeat", String(Date.now()));
    const ids = await client.zRangeByScore(REPORT_PREFIX + "queue", 0, Date.now(), { LIMIT: { offset: 0, count: 20 } });
    const jobs: ReportJob[] = [];
    for (const id of ids) {
      const raw = await client.get(REPORT_PREFIX + "job:" + id);
      if (raw) jobs.push(JSON.parse(raw) as ReportJob); else await client.zRem(REPORT_PREFIX + "queue", id);
    }
    // Two jobs may run globally; per-store leases prevent concurrent store scans.
    await Promise.all(jobs.slice(0, 20).map(processJob));
  } catch { console.error(JSON.stringify({ event: "report_worker_unavailable" })); }
  await pause(1000);
}
const client = await reportRedis();
if (client) await client.quit();
