import test from "node:test";
import assert from "node:assert/strict";
import { getReportPeriodBounds } from "./report-period.ts";
import { snapshotKey, snapshotFresh, reportScheduleDue, reportTargets, digest, summarizeShopfrontSyncDays, type ReportScope, type ReportSnapshot, type ShopfrontSyncState } from "./report-snapshots.ts";
import { cachedOdooRead, cachedReadPolicy, clearOdooReadCache, setOdooReadIdentity } from "./odoo-read-cache.ts";
import { calculateReport, type ReportRpc } from "./report-data.ts";
import type { NextRequest } from "next/server";
import { scopedReadCache } from "./scoped-read-cache.ts";
import { invalidateReportTarget } from "./report-snapshots.ts";

const scope: ReportScope = { vendorId: 1, companyId: 41, host: "demo.fixture.invalid", database: "fixture", timezone: "Australia/Adelaide", sampleDataClearedAt: null, uid: 17, permissionScope: "company-admin" };
const now = new Date("2026-11-03T00:00:00Z");
const snapshot = (generatedAt: string, period: ReportSnapshot["period"] = "last_week"): ReportSnapshot => ({ scope, key: snapshotKey(scope, period, now), body: {}, period, generatedAt, queryThrough: generatedAt, revision: "0" });

test("snapshot keys are canonical and isolate each security and business dimension", () => {
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
  const key = snapshotKey(scope, "last_week", now);
  for (const change of [{ vendorId: 2 }, { companyId: 42 }, { host: "other.fixture.invalid" }, { database: "other" }, { timezone: "Australia/Perth" }, { uid: 18 }, { permissionScope: "restricted" }, { sampleDataClearedAt: now.toISOString() }]) assert.notEqual(key, snapshotKey({ ...scope, ...change }, "last_week", now));
  assert.notEqual(key, snapshotKey(scope, "last_week", new Date("2026-11-09T00:00:00Z")));
  assert.equal(snapshotKey(scope, "today", now), snapshotKey(scope, "today", new Date(now.getTime() + 60_000)));
  assert.notEqual(snapshotKey(scope, "today", now), snapshotKey(scope, "today", new Date(now.getTime() + 86400_000)));
});

test("history schedules catch up at 00:10 and 02:00; dead stock at 02:30", () => {
  const local = (hour: string) => new Date(`2026-11-03T${hour}:00+10:30`);
  assert.equal(reportScheduleDue("yesterday", scope.timezone, false, local("00:09")), false);
  assert.equal(reportScheduleDue("yesterday", scope.timezone, false, local("00:10")), true);
  assert.equal(reportScheduleDue("dead_stock", scope.timezone, false, local("02:29")), false);
  assert.equal(reportScheduleDue("dead_stock", scope.timezone, false, local("02:30")), true);
  assert.equal(reportScheduleDue("dead_stock", scope.timezone, true, local("00:01")), true);
  assert.equal(snapshotFresh(snapshot(local("00:05").toISOString()), "0", local("00:09")), true);
  assert.equal(snapshotFresh(snapshot(local("00:05").toISOString()), "0", local("00:10")), false);
  assert.equal(snapshotFresh(snapshot(local("00:11").toISOString()), "0", local("01:59")), true);
  assert.equal(snapshotFresh(snapshot(local("00:11").toISOString()), "0", local("02:00")), false);
  assert.equal(snapshotFresh(snapshot(local("02:01").toISOString()), "0", local("23:59")), true);
  assert.equal(snapshotFresh(snapshot(local("02:01").toISOString()), "changed", local("03:00")), false);
  assert.equal(snapshotFresh(snapshot(local("02:01").toISOString(), "dead_stock"), "0", local("02:29")), true);
  assert.equal(snapshotFresh(snapshot(local("02:01").toISOString(), "dead_stock"), "0", local("02:30")), false);
  assert.equal(snapshotFresh(snapshot(local("03:00").toISOString(), "today"), "0", local("03:05")), false);
});

test("Today uses store midnight even on DST transition days", () => {
  const value = getReportPeriodBounds("today", new Date("2026-10-04T08:00:00Z"), scope.timezone);
  assert.equal(value.start.toISOString(), "2026-10-03T14:30:00.000Z");
  assert.equal(value.end.toISOString(), "2026-10-04T08:00:00.000Z");
});

test("targets require explicit valid database/company/tenant and timezone", () => {
  assert.equal(reportTargets({ ODOO_DATABASE: "fixture", REPORT_SNAPSHOT_TARGETS: JSON.stringify([scope]) }).length, 1);
  for (const change of [{ database: "production" }, { companyId: 0 }, { vendorId: -1 }, { timezone: "invalid" }, { host: "https://wrong.invalid" }]) {
    assert.throws(() => reportTargets({ ODOO_DATABASE: "fixture", REPORT_SNAPSHOT_TARGETS: JSON.stringify([{ ...scope, ...change }]) }));
  }
});

test("Shopfront completeness is evaluated per requested business day and exposes gaps", () => {
  const state = (day: string, status: ShopfrontSyncState["status"]): ShopfrontSyncState => ({
    fromDay: day, toDay: day, runId: 7, status, updatedAt: `${day}T12:00:00Z`, revision: "r1",
  });
  const days = {
    "2026-11-01": state("2026-11-01", "completed"),
    "2026-11-02": state("2026-11-02", "partial"),
    "2026-11-04": state("2026-11-04", "completed"),
  };
  assert.equal(summarizeShopfrontSyncDays(days, "2026-11-01", "2026-11-01")?.status, "completed");
  assert.equal(summarizeShopfrontSyncDays(days, "2026-11-02", "2026-11-02")?.status, "partial");
  assert.equal(summarizeShopfrontSyncDays(days, "2026-11-01", "2026-11-04")?.status, "partial");
  assert.equal(summarizeShopfrontSyncDays(days, "2026-11-03", "2026-11-03"), null);
});

test("retired Odoo BFF paths are never cached; only opt-in cached-read helpers are", () => {
  for (const path of [
    "/api/odoo/checkout/quote",
    "/api/odoo/purchase-orders",
    "/api/odoo/customer-groups",
    "/api/odoo/records",
    "/api/odoo/sales-daily",
  ]) assert.equal(cachedReadPolicy(path), null);
  assert.equal(cachedReadPolicy("/api/odoo/records", { method: "POST", body: JSON.stringify({ type: "products", refresh: true }) }), null);
  assert.equal(cachedReadPolicy("/api/cached-read/items"), 30_000);
  assert.equal(cachedReadPolicy("/api/cached-read/items?refresh=true"), 0);
  assert.equal(cachedReadPolicy("/api/products"), null);
});

test("read cache coalesces requests, isolates parameters and identity, and forces refresh", async () => {
  setOdooReadIdentity("user-one");
  let calls = 0;
  const read = () => { calls++; return Promise.resolve(Response.json({ items: [calls] })); };
  const path = "/api/cached-read/items?offset=0";
  const result = await Promise.all([cachedOdooRead(path, undefined, read), cachedOdooRead(path, undefined, read)]);
  assert.equal(calls, 1); assert.deepEqual(await result[0].json(), await result[1].json());
  await cachedOdooRead(path, undefined, read); assert.equal(calls, 1);
  await cachedOdooRead(path + "&refresh=true", undefined, read); assert.equal(calls, 2);
  await cachedOdooRead(path, undefined, read); assert.equal(calls, 3, "returning after manual refresh cannot restore the earlier browser entry");
  await cachedOdooRead(path.replace("offset=0", "offset=1"), undefined, read); assert.equal(calls, 4);
  setOdooReadIdentity("user-two");
  await cachedOdooRead(path, undefined, read); assert.equal(calls, 5);
  clearOdooReadCache();
});

test("server scoped read cache coalesces, isolates, force refreshes, and follows tenant revisions", async () => {
  const previousRedisUrl = process.env.REPORT_REDIS_URL;
  process.env.REPORT_REDIS_URL = "";
  try {
    const binding = {
      vendorId: 9182,
      subdomain: "skr-cache-fixture",
      odooCompanyId: 9183,
      odooPosConfigId: null,
      odooWarehouseId: null,
      odooStockLocationId: null,
      odooProvisionStatus: "ready",
      odooProvisionError: null,
      r2Prefix: null,
      sampleDataClearedAt: null,
    };
    const request = (session: string) => ({
      headers: new Headers({ host: "skr-cache-fixture.invalid" }),
      cookies: { get: (name: string) => name === "orithos_odoo_session" ? { value: session } : name === "orithos_access_token" ? { value: `access-${session}` } : undefined },
      nextUrl: new URL("https://skr-cache-fixture.invalid/api/products"),
    }) as unknown as NextRequest;
    const parameters = { type: "products", query: "red wine", limit: 100, offset: 0 };
    const options = { localTtlMs: 30_000, persistentTtlMs: 0 };
    let calls = 0;
    let coalesced = 0;
    let release!: (value: { items: number[] }) => void;
    const first = scopedReadCache(request("one"), binding, parameters, () => {
      calls++;
      return new Promise<{ items: number[] }>(resolve => { release = resolve; });
    }, { ...options, onCoalesced: () => { coalesced++; } });
    const concurrent = scopedReadCache(request("one"), binding, parameters, async () => {
      calls++;
      return { items: [99] };
    }, options);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(calls, 1);
    release({ items: [1] });
    assert.deepEqual(await first, { items: [1] });
    assert.deepEqual(await concurrent, { items: [1] });
    assert.equal(coalesced, 1);

    let cacheHit = false;
    assert.deepEqual(await scopedReadCache(request("one"), binding, parameters, async () => {
      calls++;
      return { items: [2] };
    }, { ...options, onCacheHit: () => { cacheHit = true; } }), { items: [1] });
    assert.equal(cacheHit, true);
    assert.equal(calls, 1);

    await scopedReadCache(request("two"), binding, parameters, async () => {
      calls++;
      return { items: [3] };
    }, options);
    assert.equal(calls, 2, "another authenticated session has an isolated cache entry");

    await scopedReadCache(request("one"), binding, parameters, async () => {
      calls++;
      return { items: [4] };
    }, { ...options, force: true });
    assert.equal(calls, 3, "manual refresh bypasses the old value and replaces it");

    await invalidateReportTarget({ database: process.env.ODOO_DATABASE || "unconfigured", vendorId: binding.vendorId,
      companyId: binding.odooCompanyId!, host: "skr-cache-fixture.invalid", timezone: "UTC", sampleDataClearedAt: null });
    await scopedReadCache(request("one"), binding, parameters, async () => {
      calls++;
      return { items: [5] };
    }, options);
    assert.equal(calls, 4, "a tenant revision change makes prior catalog data unreachable");
  } finally {
    if (previousRedisUrl === undefined) delete process.env.REPORT_REDIS_URL;
    else process.env.REPORT_REDIS_URL = previousRedisUrl;
  }
});

test("one cancelled subscriber does not abort another, and invalidation rejects obsolete responses", async () => {
  setOdooReadIdentity("user-cancel");
  let release!: (response: Response) => void;
  let transportSignal: AbortSignal | null | undefined;
  const read = (init?: RequestInit) => { transportSignal = init?.signal; return new Promise<Response>(resolve => { release = resolve; }); };
  const controller = new AbortController();
  const first = cachedOdooRead("/api/cached-read/categories", { signal: controller.signal }, read);
  const second = cachedOdooRead("/api/cached-read/categories", undefined, read);
  controller.abort();
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(transportSignal?.aborted, false);
  release(Response.json({ items: [] })); assert.equal((await second).status, 200);
  const stale = cachedOdooRead("/api/cached-read/pricelists", undefined, read);
  clearOdooReadCache(); release(Response.json({ items: [] }));
  await assert.rejects(stale, { name: "AbortError" });
});

test("summary preserves dashboard metrics without graphs, product rankings or recent sales", async () => {
  const calls: string[] = [];
  const rpc = (async (_session: string, model: string, method: string) => {
    calls.push(`${model}.${method}`);
    return method === "read_group" ? [{ amount_total: 123.45 }] : method === "search_read" ? [] : 3;
  }) as ReportRpc;
  const result = await calculateReport(rpc, { sessionId: "fixture", companyId: 41, company: { name: "Fixture", currency: "AUD", timezone: scope.timezone }, period: "today", summaryOnly: true, now });
  assert.equal(calls.length, 7); assert.equal(result.revenue, 123.45);
  assert.equal(calls.filter(value => value === "pos.order.line.search_read").length, 1);
  assert.equal(calls.includes("pos.order.search_read"), false);
  assert.equal("trend" in result, false);
});
