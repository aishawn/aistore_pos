import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { scopedOdoo } from "./odoo-scope";
import { requirePermission, StoreAccessError } from "./store-access";
import { isSameOrigin } from "./server-auth";
import { calculateReport } from "./report-data";
import { calculateDeadStock } from "./dead-stock-data";
import { getReportPeriodBounds } from "./report-period.ts";
import { reconcileSourceGrossTotals } from "./report-source-reconciliation.ts";
import { isValidBusinessDay, salesDate } from "./replenishment-safety.ts";
import { companyReportRpc, readReportCompany } from "./report-odoo";
import { verifiedShopfrontSourceStore, verifiedShopfrontSourceStoreFromHost } from "./shopfront-store-scope";
import {
  REPORT_PREFIX, digest, enqueueReport, readSnapshot, readShopfrontSyncState, reportRedis, reportTargets, snapshotFresh,
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
  const rpc = companyReportRpc(companyId, undefined, binding.odooWarehouseId);
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
    // Keep source reporting available for the two verified production hosts when
    // tenant provisioning metadata is temporarily stale or incomplete.
    shopfrontStore: verifiedShopfrontSourceStore(binding) ?? verifiedShopfrontSourceStoreFromHost(host) ?? undefined,
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
  return { scope: reportScope, company, sessionId, shared, binding };
}

function response(body: unknown, status = 200, timing?: string) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...(timing ? { "Server-Timing": timing } : {}) } });
}

function responseReportBody(body: Record<string, unknown>, syncEventsCoverPeriod: boolean) {
  const { sourceMarginFallback, ...visible } = body;
  if (!sourceMarginFallback || typeof sourceMarginFallback !== "object") return {
    ...visible,
    ...(visible.sourceReconciliation === "mismatch" ? { sourceReconciliation: "unavailable" } : {}),
  };
  const fallback = sourceMarginFallback as { grossMarginPercent?: unknown; coverage?: unknown; grossSales?: unknown; tax?: unknown; completedOrders?: unknown };
  if (typeof fallback.grossMarginPercent !== "number" || !Number.isFinite(fallback.grossMarginPercent)) return {
    ...visible,
    sourceReconciliation: reconcileSourceGrossTotals({ sourceGross: fallback.grossSales, sourceTax: fallback.tax,
      odooPositiveGross: visible.grossSales, odooPositiveTax: visible.grossTax, comparisonBasis: "distinct_ledgers" }),
  };
  const calculatedReconciliation = reconcileSourceGrossTotals({ sourceGross: fallback.grossSales, sourceTax: fallback.tax,
    odooPositiveGross: visible.grossSales, odooPositiveTax: visible.grossTax, comparisonBasis: "distinct_ledgers" });
  const sourceReconciliation = calculatedReconciliation;
  const preserveLedgerMargin = visible.grossMarginStatus === "verified";
  const sourceGross = typeof fallback.grossSales === "number" && Number.isFinite(fallback.grossSales) ? fallback.grossSales : null;
  const sourceTax = typeof fallback.tax === "number" && Number.isFinite(fallback.tax) ? fallback.tax : null;
  const sourceOrders = typeof fallback.completedOrders === "number" && Number.isFinite(fallback.completedOrders) ? fallback.completedOrders : null;
  const sourceFigures = sourceGross === null ? {} : Object.hasOwn(visible, "yesterdayGrossMargin")
    ? { yesterdaySales: sourceGross, ...(sourceTax !== null ? { yesterdayTax: sourceTax } : {}) }
    : { revenue: sourceGross, grossSales: sourceGross, ...(sourceTax !== null ? { tax: sourceTax, grossTax: sourceTax } : {}), ...(sourceOrders !== null ? { transactions: sourceOrders } : {}) };
  return {
    ...visible,
    ...sourceFigures,
    ...(!preserveLedgerMargin ? {
      ...(Object.hasOwn(visible, "yesterdayGrossMargin") ? { yesterdayGrossMargin: fallback.grossMarginPercent } : { grossMarginPercent: fallback.grossMarginPercent }),
      grossMarginCoverage: typeof fallback.coverage === "number" ? fallback.coverage : 1,
      grossMarginStatus: syncEventsCoverPeriod ? "source_margin" : "source_margin_unverified",
      grossMarginBasis: "shopfront_revenue_minus_cost",
    } : {}),
    sourceReconciliation,
  };
}

export async function serveReport(request: NextRequest, deadStock = false) {
  const started = performance.now();
  try {
    const summary = !deadStock && request.nextUrl.searchParams.get("view") === "summary";
    const access = await reportAccess(request, summary);
    const authMs = performance.now() - started;
    const requested = request.nextUrl.searchParams.get("period");
    const period = deadStock ? "dead_stock" : summary ? "today" : requested === "last_7_days" ? "last_week" : requested;
    const fromDay = request.nextUrl.searchParams.get("from");
    const toDay = request.nextUrl.searchParams.get("to");
    if ((fromDay || toDay) && (!fromDay || !toDay || !isValidBusinessDay(fromDay) || !isValidBusinessDay(toDay) || fromDay > toDay || period !== "custom")) {
      return response({ message: "Choose a valid custom report date range." }, 400);
    }
    if (period === "custom" && (!fromDay || !toDay)) return response({ message: "Choose both dates for a custom report." }, 400);
    const calendar = ["today", "yesterday", "last_7_days", "last_week", "last_month", "dead_stock"].includes(period || "");
    const coveragePeriod = summary ? "yesterday" : period;
    const bounds = calendar && coveragePeriod && coveragePeriod !== "dead_stock" ? getReportPeriodBounds(coveragePeriod as Exclude<SnapshotPeriod, "dead_stock">, new Date(), access.scope.timezone) : null;
    const customBounds = period === "custom" && fromDay && toDay ? { start: new Date(`${fromDay}T12:00:00Z`), end: new Date(`${toDay}T12:00:00Z`) } : null;
    const periodFrom = bounds ? salesDate(bounds.start.toISOString(), access.scope.timezone) : customBounds ? fromDay : null;
    const periodThrough = bounds ? salesDate(new Date(bounds.end.getTime() - 1).toISOString(), access.scope.timezone) : customBounds ? toDay : null;
    const sourceState = await readShopfrontSyncState(access.scope, periodFrom, periodThrough);
    const sourceSyncEventsCoverPeriod = Boolean(sourceState && sourceState.status === "completed" && periodFrom && periodThrough
      && sourceState.fromDay <= periodFrom && sourceState.toDay >= periodThrough);
    const sourceMetadata = {
      sourceSyncedThrough: sourceState?.toDay ?? null,
      sourceSyncUpdatedAt: sourceState?.updatedAt ?? null,
      syncRunId: sourceState?.runId ?? null,
      dataRevision: await snapshotRevision(access.scope),
      completeness: sourceState?.status === "partial" || sourceState?.status === "failed" ? "incomplete" : "unverified",
      sourceSyncEventsCoverPeriod,
      sourceSyncStatus: sourceState?.status ?? "unknown",
    };
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
      if (snapshot && !summary && !Array.isArray(snapshot.body.trend)) snapshot = null;
      const fresh = snapshot && snapshotFresh(snapshot, revision);
      if ((force && !task) || !fresh) {
        const job = await enqueueReport(access.scope, period as SnapshotPeriod, true, true, force);
        if (!job) throw new Error("Report queue unavailable");
        nextTask = job.id;
        const allowStale = request.nextUrl.searchParams.get("stale") === "allow";
        if (!snapshot || (force && !task) || (!fresh && !allowStale)) {
          return response({ ...sourceMetadata, taskId: job.id, updateStatus: "queued", retryAfterMs: 2000, period }, 202, `auth;dur=${authMs.toFixed(1)}`);
        }
      }
      if (snapshot) return response({ ...sourceMetadata, ...responseReportBody(snapshot.body, sourceSyncEventsCoverPeriod), generatedAt: snapshot.generatedAt, queryThrough: snapshot.queryThrough,
        cacheStatus: fresh ? "HIT" : "STALE", taskId: nextTask, updateStatus: fresh ? "complete" : "queued" }, 200,
      `auth;dur=${authMs.toFixed(1)}, cache;dur=${(performance.now() - started - authMs).toFixed(1)}, odoo;desc="0 aggregate calls"`);
    }
    } catch { access.shared = false; }
    // Restricted users and Redis outages use their own Odoo session and bounded local cache.
    const parsedHours = Number(request.nextUrl.searchParams.get("hours") || 720);
    const hours = [8, 24, 168, 720, 2160, 4320].includes(parsedHours) ? parsedHours : 720;
    const localKey = digest([access.scope, calendar ? snapshotKey(access.scope, period as SnapshotPeriod) : [period, hours, fromDay, toDay], revision, summary]);
    const old = fallback.get(localKey);
    if (!force && old && (calendar ? snapshotFresh(old, revision) : Date.now() - Date.parse(old.generatedAt) < 30_000)) snapshot = old;
    else {
      let flight = flights.get(localKey);
      if (!flight) {
        flight = limited(targetId(access.scope), async () => {
          const queryStarted = performance.now(); let rpcCalls = 0;
          const rpc = companyReportRpc(access.scope.companyId, () => { rpcCalls++; }, access.binding?.odooWarehouseId);
          const body = deadStock
            ? await calculateDeadStock(rpc, access.sessionId, access.scope.companyId, undefined, new Date(), access.scope.sampleDataClearedAt)
            : await calculateReport(rpc, { sessionId: access.sessionId, companyId: access.scope.companyId, company: access.company,
              period, fromDay, toDay, hours, summaryOnly: summary, sampleDataClearedAt: access.scope.sampleDataClearedAt,
              sourceStore: access.scope.shopfrontStore, stockLocationId: access.binding?.odooStockLocationId });
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
    return response({ ...sourceMetadata, ...responseReportBody(snapshot.body, sourceSyncEventsCoverPeriod), generatedAt: snapshot.generatedAt, queryThrough: snapshot.queryThrough, cacheStatus: snapshot === old ? "HIT" : "LIVE", updateStatus: "complete" }, 200,
      `auth;dur=${authMs.toFixed(1)}, total;dur=${(performance.now() - started).toFixed(1)}`);
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 502;
    return response({ message: status === 401 ? "Orithos session expired" : error instanceof Error ? error.message : "Reports are unavailable" }, status);
  }
}
