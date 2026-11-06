/** Read-only route checks, including real crawler data when --live-source is set. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "pos-ui/package.json"));
const ts = require("typescript");
const { NextRequest, NextResponse } = require("next/server");
const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };
function compile(file, imports, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const context = vm.createContext({ exports, require: (name) => { if (!(name in imports)) throw new Error(`Unexpected import: ${name}`); return imports[name]; }, console, setTimeout, clearTimeout, AbortSignal, ...globals });
  vm.runInContext(source, context);
  return exports;
}
const model = compile("pos-ui/src/lib/shopfront-purchasing.ts", {});
const supplier = model.normalizePurchasingRow({ source_id: "s1", name: "ALM", status: "ACTIVE", raw_payload: { contact: { email: "orders@example.invalid" } } }, "suppliers");
const order = model.normalizePurchasingRow({ source_id: "p1", total_cost: "0.0000", raw_payload: { invoiceNumber: "94209", products: [{ supplier: { name: "ALM" }, item: { name: "Wine" }, orderedQuantity: 0 }] } }, "purchase-orders");
check("source ID, zero cost/quantity and missing received quantity preserved", () => {
  assert.equal(order.id, "p1"); assert.equal(order.total, "0.0000"); assert.equal(order.lines[0].ordered, 0); assert.equal(order.lines[0].received, null);
});
check("search and status filters cover supplier contact and purchase reference", () => {
  assert.equal(model.filterPurchasingRows([supplier], "ORDERS@", "ACTIVE").length, 1);
  assert.equal(model.filterPurchasingRows([supplier], "alm", "INACTIVE").length, 0);
  assert.equal(model.filterPurchasingRows([order], "94209", "all").length, 1);
  assert.equal(model.filterPurchasingRows([order], "alm", "all").length, 1);
});
class StoreAccessError extends Error { constructor(message, status) { super(message); this.status = status; } }
let access = true;
let binding = { vendorId: 55, odooCompanyId: 5, subdomain: "skr", r2Prefix: "shopfront/skr/", odooProvisionStatus: "ready" };
let sourceCalls = 0;
let sourceMode = "fixture";
let clockOffset = 0;
let ledger = [];
let sessionExpired = false;
class OdooScopeError extends Error { constructor(message, status) { super(message); this.status = status; } }
const ledgerModel = compile("pos-ui/src/lib/shopfront-purchasing-ledger.ts", { "./shopfront-purchasing.ts": model });
const route = compile("pos-ui/app/api/shopfront/purchasing/route.ts", {
  "next/server": { NextRequest, NextResponse },
  "@/lib/server-auth": { isSameOrigin: (request) => !request.headers.get("origin") || request.headers.get("origin") === "https://skr.orithos.com.au" },
  "@/lib/odoo-tenant-company": { fetchTenantOdooBinding: async () => binding },
  "@/lib/store-access": { StoreAccessError, requirePermission: async () => { if (!access) throw new StoreAccessError("Denied", 403); } },
  "@/lib/shopfront-purchasing": model,
  "@/lib/odoo-scope": { OdooScopeError, scopedOdoo: async () => {
    if (sessionExpired) throw new OdooScopeError("Odoo session expired.", 401);
    return { binding, companyIds: [5], rpc: async () => {} };
  } },
  "@/lib/shopfront-purchasing-ledger": { ...ledgerModel, loadPurchasingLedger: async () => ledger },
}, { Date: { now: () => Date.now() + clockOffset }, fetch: async (url, options) => {
  sourceCalls++;
  assert.equal(options?.method, undefined, "source requests must only read");
  assert.equal(new URL(url).searchParams.get("store"), "skr");
  if (sourceMode === "failed") return new Response("unavailable", { status: 503 });
  if (sourceMode === "live") return fetch(url.replace("http://shopfront-crawler:8000", "https://crawler.orithos.com.au"), options);
  const page = Number(new URL(url).searchParams.get("page"));
  const rows = Array.from({ length: page === 1 ? 500 : 1 }, (_, i) => ({ source_id: String((page - 1) * 500 + i), name: "Supplier", status: "ACTIVE" }));
  return Response.json({ data: rows, pagination: { total: 501 } });
} });
async function get(query, headers = {}) {
  const response = await route.GET(new NextRequest(`https://skr.orithos.com.au/api/shopfront/purchasing?${query}`, { headers }));
  return { status: response.status, body: await response.json() };
}
let result = await get("type=suppliers", { origin: "https://evil.example" });
check("cross-origin rejected before source access", () => { assert.equal(result.status, 403); assert.equal(sourceCalls, 0); });
access = false; result = await get("type=suppliers");
check("permission denial prevents source access", () => { assert.equal(result.status, 403); assert.equal(sourceCalls, 0); });
access = true; binding = null; result = await get("type=suppliers&config=1");
check("binding failure fails closed", () => { assert.equal(result.status, 503); assert.equal(sourceCalls, 0); });
binding = { vendorId: 55, odooCompanyId: 5, subdomain: "demo", r2Prefix: "shopfront/skr/", odooProvisionStatus: "ready" };
result = await get("type=suppliers&store=skr");
check("another tenant cannot select SKR with query parameters", () => { assert.equal(result.status, 404); assert.equal(sourceCalls, 0); });
result = await get("type=suppliers&config=1");
check("other stores retain native Odoo directories", () => { assert.equal(result.body.enabled, false); });
binding = { vendorId: 55, odooCompanyId: 5, subdomain: "skr", r2Prefix: "shopfront/skr/", odooProvisionStatus: "ready" };
result = await get("type=suppliers&offset=Infinity");
check("invalid pagination rejected before source access", () => { assert.equal(result.status, 400); assert.equal(sourceCalls, 0); });
result = await get("type=suppliers&offset=480");
check("all source pages collected and final page is complete", () => {
  assert.equal(result.status, 200); assert.equal(result.body.sourceTotal, 501); assert.equal(result.body.items.length, 21); assert.equal(result.body.hasNext, false); assert.equal(sourceCalls, 2);
});
sourceMode = "failed"; result = await get("type=purchase-orders");
check("source failure without a durable ledger returns an error", () => { assert.equal(result.status, 502); assert.equal(result.body.items, undefined); });
sessionExpired = true; result = await get("type=suppliers");
check("expired Odoo session is recoverable by the frontend", () => { assert.equal(result.status, 401); });
sessionExpired = false;
ledger = [order]; result = await get("type=purchase-orders");
check("crawler outage retains preserved source orders", () => { assert.equal(result.status, 200); assert.equal(result.body.sourceTotal, 1); assert.equal(result.body.items[0].id, "p1"); });
ledger = [];
let live = null;
if (process.argv.includes("--live-source")) {
  // Expire the route cache before verifying the real source.
  sourceMode = "live";
  clockOffset = 120_000;
  const suppliers = await get("type=suppliers");
  const orders = await get("type=purchase-orders");
  check("real SKR source counts reconcile to 109 / 2355", () => {
    assert.equal(suppliers.status, 200); assert.equal(suppliers.body.sourceTotal, 109);
    assert.equal(orders.status, 200); assert.equal(orders.body.sourceTotal, 2355);
    assert.equal(orders.body.items.length, 40); assert.equal(orders.body.hasNext, true);
    assert.equal(orders.body.readOnly, true);
    assert.ok(orders.body.items.every((row) => !/codex/i.test(row.name + row.supplier)));
  });
  live = { suppliers: suppliers.body.sourceTotal, purchaseOrders: orders.body.sourceTotal, firstOrderDate: orders.body.items[0].date };
}
console.log(JSON.stringify({ status: "PASS", checks, liveSource: live, sourceBusinessWrites: 0 }, null, 2));
