import test from "node:test";
import assert from "node:assert/strict";
import { getReportPeriodBounds } from "./report-period.ts";
import { snapshotKey, snapshotFresh, reportTargets, digest, type ReportScope, type ReportSnapshot } from "./report-snapshots.ts";
import { cachedOdooRead, cachedReadPolicy, clearOdooReadCache, setOdooReadIdentity } from "./odoo-read-cache.ts";
import { calculateReport, type ReportRpc } from "./report-data.ts";

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

test("only whitelisted reads are cached; financial validation and immutable pagination remain live", () => {
  for (const path of ["/api/odoo/checkout/quote", "/api/odoo/checkout/status", "/api/odoo/customer-balances", "/api/odoo/sales/5"]) assert.equal(cachedReadPolicy(path), null);
  assert.equal(cachedReadPolicy("/api/odoo/records", { method: "POST", body: JSON.stringify({ type: "products", inventoryReport: true }) }), null);
  assert.equal(cachedReadPolicy("/api/odoo/purchase-orders"), 30_000);
  assert.equal(cachedReadPolicy("/api/odoo/sales-daily", { method: "POST", body: JSON.stringify({ offset: 40 }) }), 30_000);
  assert.equal(cachedReadPolicy("/api/odoo/customer-groups"), 300_000);
});

test("read cache coalesces requests, isolates parameters and identity, and forces refresh", async () => {
  setOdooReadIdentity("user-one");
  let calls = 0;
  const read = () => { calls++; return Promise.resolve(Response.json({ items: [calls] })); };
  const path = "/api/odoo/purchase-orders?offset=0";
  const result = await Promise.all([cachedOdooRead(path, undefined, read), cachedOdooRead(path, undefined, read)]);
  assert.equal(calls, 1); assert.deepEqual(await result[0].json(), await result[1].json());
  await cachedOdooRead(path, undefined, read); assert.equal(calls, 1);
  await cachedOdooRead(path + "&refresh=true", undefined, read); assert.equal(calls, 2);
  await cachedOdooRead(path.replace("offset=0", "offset=1"), undefined, read); assert.equal(calls, 3);
  setOdooReadIdentity("user-two");
  await cachedOdooRead(path, undefined, read); assert.equal(calls, 4);
  clearOdooReadCache();
});

test("one cancelled subscriber does not abort another, and invalidation rejects obsolete responses", async () => {
  setOdooReadIdentity("user-cancel");
  let release!: (response: Response) => void;
  let transportSignal: AbortSignal | null | undefined;
  const read = (init?: RequestInit) => { transportSignal = init?.signal; return new Promise<Response>(resolve => { release = resolve; }); };
  const controller = new AbortController();
  const first = cachedOdooRead("/api/odoo/categories", { signal: controller.signal }, read);
  const second = cachedOdooRead("/api/odoo/categories", undefined, read);
  controller.abort();
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(transportSignal?.aborted, false);
  release(Response.json({ items: [] })); assert.equal((await second).status, 200);
  const stale = cachedOdooRead("/api/odoo/pricelists", undefined, read);
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
  assert.equal(calls.length, 6); assert.equal(result.revenue, 123.45);
  assert.equal(calls.filter(value => value === "pos.order.line.search_read").length, 1);
  assert.equal(calls.includes("pos.order.search_read"), false);
  assert.equal("trend" in result, false);
});
