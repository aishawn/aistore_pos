import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { scopedOdoo } from "./odoo-scope";
import { requirePermission, StoreAccessError } from "./store-access";
import { isSameOrigin } from "./server-auth";
import { calculateReport } from "./report-data";
import { calculateDeadStock } from "./dead-stock-data";
import { companyReportRpc, readReportCompany } from "./report-odoo";
import {
  REPORT_PREFIX, digest, enqueueReport, readSnapshot, reportRedis, reportTargets, snapshotFresh,
  snapshotKey, snapshotRevision, targetId, type ReportJob, type ReportScope, type ReportSnapshot, type SnapshotPeriod,
} from "./report-snapshots";


const fallback = new Map<string, ReportSnapshot>();
const flights = new Map<string, Promise<ReportSnapshot>>();
const metadata = new Map<string, { expires: number; company: Awaited<ReturnType<typeof readReportCompany>> }>();
let active = 0;
const stores = new Set<string>();
const waiting: Array<{ store: string; start: () => void }> = [];
async function limited<T>(store: string, run: () => Promise<T>): Promise<T> {
  if (waiting.length >= 20) throw Object.assign(new Error("Reports are busy. Please retry shortly."), { status: 503 });
  await new Promise<void>(resolve => {
    const start = () => { active++; stores.add(store); resolve(); };
    if (active < 2 && !stores.has(store)) start(); else waiting.push({ store, start });
  });
  try { return await run(); }
  finally {
    active--; stores.delete(store);
    for (let i = 0; i < waiting.length && active < 2; ) {
      if (stores.has(waiting[i].store)) { i++; continue; }
      waiting.splice(i, 1)[0].start();
    }
  }
}

export async function reportAccess(request: NextRequest, summary = false) {
  if (!isSameOrigin(request)) throw new StoreAccessError("Cross-origin requests are not allowed", 403);
  const me = await requirePermission(request, ...(summary ? ["reports.dashboard", "sell.checkout"] : ["reports.dashboard"]));
  const scope = await scopedOdoo(request);
  const binding = scope.binding;
  if (!binding) throw new StoreAccessError("Store binding is unavailable", 503);
  const companyId = scope.companyIds[0];
  const sessionId = request.cookies.get("orithos_odoo_session")!.value;
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host).split(",")[0].trim().toLowerCase();
  const userKey = createHash("sha256").update(JSON.stringify([sessionId, request.cookies.get("orithos_access_token")?.value, scope.uid, companyId, binding.vendorId, host])).digest("hex");
  const rpc = companyReportRpc(companyId);
  const cachedCompany = metadata.get(userKey);
  let company = cachedCompany && cachedCompany.expires > Date.now() ? cachedCompany.company : null;
  if (!company) {
    company = await readReportCompany(rpc, sessionId, companyId);
    if (metadata.size >= 128) metadata.delete(metadata.keys().next().value!);
    metadata.set(userKey, { company, expires: Date.now() + 300_000 });
  }
  const reportScope: ReportScope = {
    database: process.env.ODOO_DATABASE || "unconfigured", vendorId: binding.vendorId, companyId, host,
    timezone: company.timezone, sampleDataClearedAt: binding.sampleDataClearedAt ?? null,
    uid: scope.uid, permissionScope: `user:${userKey}`,
  };
  let shared = false;
  const client = await reportRedis();
  if (client && scope.database === reportScope.database && (me.isAdmin || me.roleCode === "ADMIN")) {
    try {
    const target = reportTargets().find(t => targetId(t) === targetId(reportScope) && t.timezone === company!.timezone);
    if (target) {
      const identity = await client.get(REPORT_PREFIX + "identity:" + targetId(target));
      if (identity && Number(identity) === scope.uid) {
        reportScope.permissionScope = "company-admin";
        shared = true;
        await client.set(REPORT_PREFIX + "target:" + targetId(target), JSON.stringify(reportScope), { EX: 604800 });
      }
    }
    } catch { shared = false; reportScope.permissionScope = `user:${userKey}`; }
  }
  return { scope: reportScope, company, sessionId, shared };
}

function response(body: unknown, status = 200, timing?: string) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...(timing ? { "Server-Timing": timing } : {}) } });
}

export async function serveReport(request: NextRequest, deadStock = false) {
  const started = performance.now();
  try {
    const summary = !deadStock && request.nextUrl.searchParams.get("view") === "summary";
    const access = await reportAccess(request, summary);
    const authMs = performance.now() - started;
    const requested = request.nextUrl.searchParams.get("period");
    const period = deadStock ? "dead_stock" : summary ? "today" : requested;
    if (!summary && requested === "today") return response({ message: "Today requires view=summary" }, 400);
    const calendar = ["today", "yesterday", "last_week", "last_month", "dead_stock"].includes(period || "");
    const force = request.nextUrl.searchParams.get("refresh") === "true";
    const task = request.nextUrl.searchParams.get("task");
    const revision = await snapshotRevision(access.scope);
    const client = await reportRedis();
    let nextTask: string | undefined;
    let snapshot: ReportSnapshot | null = null;
    try {
    if (task && access.shared && client) {
      if (!/^[a-f0-9]{64}$/.test(task) || !client) return response({ message: "Report task is unavailable" }, 404);
      const raw = await client.get(REPORT_PREFIX + "job:" + task);
      const job = raw ? JSON.parse(raw) as ReportJob : null;
      if (!job || job.period !== period || digest(job.scope) !== digest(access.scope) || job.key !== snapshotKey(access.scope, job.period) || job.revision !== revision) return response({ message: "Report task is unavailable" }, 404);
      if (job.state === "failed") return response({ message: "Report preparation failed. Please retry.", taskId: job.id, updateStatus: "failed" }, 502);
      if (job.state !== "complete") return response({ taskId: job.id, updateStatus: job.state, retryAfterMs: 2000 }, 202);
      // Read the completed snapshot below; never start another forced refresh while polling.
    }
    if (calendar && access.shared && client) {
      snapshot = await readSnapshot(access.scope, period as SnapshotPeriod);
      const fresh = snapshot && snapshotFresh(snapshot, revision);
      if ((force && !task) || !fresh) {
        const job = await enqueueReport(access.scope, period as SnapshotPeriod, true, true, force);
        if (!job) throw new Error("Report queue unavailable");
        nextTask = job.id;
        if (!snapshot || (force && !task)) return response({ taskId: job.id, updateStatus: "queued", retryAfterMs: 2000 }, 202, `auth;dur=${authMs.toFixed(1)}`);
      }
      if (snapshot) return response({ ...snapshot.body, generatedAt: snapshot.generatedAt, queryThrough: snapshot.queryThrough,
        cacheStatus: fresh ? "HIT" : "STALE", taskId: nextTask, updateStatus: fresh ? "complete" : "queued" }, 200,
      `auth;dur=${authMs.toFixed(1)}, cache;dur=${(performance.now() - started - authMs).toFixed(1)}, odoo;desc="0 aggregate calls"`);
    }
    } catch { access.shared = false; }
    // Restricted users and Redis outages use their own Odoo session and bounded local cache.
    const parsedHours = Number(request.nextUrl.searchParams.get("hours") || 720);
    const hours = [8, 24, 168, 720, 2160, 4320].includes(parsedHours) ? parsedHours : 720;
    const localKey = digest([access.scope, calendar ? snapshotKey(access.scope, period as SnapshotPeriod) : [period, hours], revision, summary]);
    const old = fallback.get(localKey);
    if (!force && old && (calendar ? snapshotFresh(old, revision) : Date.now() - Date.parse(old.generatedAt) < 30_000)) snapshot = old;
    else {
      let flight = flights.get(localKey);
      if (!flight) {
        flight = limited(targetId(access.scope), async () => {
          const queryStarted = performance.now(); let rpcCalls = 0;
          const rpc = companyReportRpc(access.scope.companyId, () => { rpcCalls++; });
          const body = deadStock
            ? await calculateDeadStock(rpc, access.sessionId, access.scope.companyId, undefined, new Date(), access.scope.sampleDataClearedAt)
            : await calculateReport(rpc, { sessionId: access.sessionId, companyId: access.scope.companyId, company: access.company,
              period, hours, summaryOnly: summary, sampleDataClearedAt: access.scope.sampleDataClearedAt });
          const result: ReportSnapshot = { key: localKey, generatedAt: new Date().toISOString(), queryThrough: String("to" in body ? body.to : new Date().toISOString()),
            body: { ...body, queryMetrics: { rpcCalls, durationMs: Math.round(performance.now() - queryStarted) } }, scope: access.scope,
            period: (calendar ? period : "today") as SnapshotPeriod, revision };
          if (fallback.size >= 128) fallback.delete(fallback.keys().next().value!);
          fallback.set(localKey, result);
          return result;
        }).finally(() => flights.delete(localKey));
        flights.set(localKey, flight);
      }
      snapshot = await flight;
    }
    return response({ ...snapshot.body, generatedAt: snapshot.generatedAt, queryThrough: snapshot.queryThrough, cacheStatus: snapshot === old ? "HIT" : "LIVE", updateStatus: "complete" }, 200,
      `auth;dur=${authMs.toFixed(1)}, total;dur=${(performance.now() - started).toFixed(1)}`);
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 502;
    return response({ message: status === 401 ? "Orithos session expired" : error instanceof Error ? error.message : "Reports are unavailable" }, status);
  }
}
