/** Actual records route and scoped transport; no live network or business writes. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = path.join(root, "pos-ui");
const require = createRequire(path.join(ui, "package.json"));
const ts = require("typescript");
const { NextRequest } = require("next/server");
const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const mod = new Module(file); modules.set(file, mod); mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod.require = (id) => id.startsWith("@/") ? load(path.join(ui, "src", id.slice(2)) + ".ts") : id.startsWith(".") ? load(path.resolve(path.dirname(file), id.endsWith(".ts") ? id : id + ".ts")) : require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
  return mod.exports;
}
let company = 41, permissions = ["stock.products.view", "customers.balances"], costDenied = false, unavailable = false;
const sourceId = "a".repeat(32);
const products = Array.from({ length: 1012 }, (_, index) => ({
  id: index + 1, company_id: 41, product_tmpl_id: [index + 1, `Wine ${index + 1}`], name: `Wine ${index + 1}`, display_name: `Wine ${index + 1}`, barcode: `930${index}`, default_code: false,
  sale_ok: true, available_in_pos: true, list_price: 10 + index % 2, taxes_id: [1], standard_price: 2.005,
  qty_available: index - 4.5, free_qty: index - 4.5, pos_categ_ids: [index % 2 ? 1 : 2], uom_id: [1, "Units"],
}));
products.push({ ...products[0], id: 2000, company_id: 42, name: "Foreign store", qty_available: 900000 });
const json = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
function matches(record, domain) {
  let cursor = 0;
  const expression = () => {
    const item = domain[cursor++];
    if (item === "|") { const a = expression(), b = expression(); return a || b; }
    if (item === "&") { const a = expression(), b = expression(); return a && b; }
    if (item === "!") return !expression();
    const [key, operator, expected] = item;
    const value = record[key];
    if (operator === "=") return value === expected;
    if (operator === ">") return value > expected;
    if (operator === "<") return value < expected;
    if (operator === "in") return Array.isArray(value) ? value.some((id) => expected.includes(id)) : expected.includes(value);
    if (operator === "ilike") return String(value).toLowerCase().includes(expected.toLowerCase());
    throw new Error(`Unmocked operator ${operator}`);
  };
  const results = []; while (cursor < domain.length) results.push(expression());
  return results.every(Boolean);
}
const calls = [], checks = [];
const originalFetch = globalThis.fetch, originalBase = process.env.ODOO_BASE_URL;
process.env.ODOO_BASE_URL = "https://inventory.fixture.invalid";
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.endsWith("/api/auth/me")) return json({ code: 0, data: { id: 17, vendorId: company, isAdmin: false, permissions } });
  if (url.endsWith("/api/tenant/odoo-binding")) return json({ code: 0, data: { vendorId: company, odooCompanyId: company, odooProvisionStatus: "ready" } });
  assert.ok(url.startsWith("https://inventory.fixture.invalid/"), "No live network");
  if (url.endsWith("/web/session/get_session_info")) return json({ result: { uid: 17, user_context: { allowed_company_ids: [41, 42] } } });
  const { params } = JSON.parse(options.body);
  const { model, method, args, kwargs } = params;
  calls.push({ model, method, kwargs });
  assert.ok(["search_read", "search_count", "fields_get", "compute_all"].includes(method), "Read-only methods");
  if (method !== "compute_all") assert.deepEqual(kwargs.context.allowed_company_ids, [company]);
  if (model === "pos.category" && method === "fields_get") return json({ result: { company_id: { type: "many2one" } } });
  if (model === "pos.category") return json({ result: [{ id: 1, name: "Wine", company_id: company }, { id: 2, name: "Beer", company_id: company }].filter((row) => matches(row, args[0])) });
  if (model === "account.tax") return json({ result: { total_included: args[1] * 1.1, total_excluded: args[1] } });
  if (model === "product.template") return json({ result: [{ id: 1012, company_id: 41, shopfront_source_ref: `skr:${sourceId}`, active: true, sale_ok: true, default_code: false }].filter((row) => matches(row, args[0])).map((row) => Object.fromEntries(kwargs.fields.map((field) => [field, row[field]]))) });
  if (model === "shopfront.sync.product") return json({ result: [{ store_key: "skr", source_id: sourceId, source_status: "ACTIVE", name: "Source wine", sku: false, category: "Red", case_quantity: 6, cost: 72.5, price: 18.99, track_inventory: true, raw_payload: { costTaxRate: { name: "GST" }, taxRate: { name: "Retail GST" } } }].filter((row) => matches(row, args[0])).map((row) => Object.fromEntries(kwargs.fields.map((field) => [field, row[field]]))) });
  if (model === "shopfront.sync.inventory") return json({ result: [{ store_key: "skr", source_product_id: sourceId, quantity: 0, single_level: 0, case_level: 0, snapshot_at: "2026-11-08T00:00:00Z" }].filter((row) => matches(row, args[0])).map((row) => Object.fromEntries(kwargs.fields.map((field) => [field, row[field]]))) });
  if (model === "product.product") {
    assert.ok(args[0].some((term) => Array.isArray(term) && term[0] === "company_id" && term[2][0] === company), "Company domain retained");
    if (unavailable) return json({ error: { data: { name: "odoo.exceptions.UserError" } } });
    if (costDenied && kwargs.fields?.includes("standard_price")) return json({ error: { data: { name: "odoo.exceptions.AccessError" } } });
    const rows = products.filter((p) => matches(p, args[0]));
    if (method === "search_count") return json({ result: rows.length });
    return json({ result: rows.slice(kwargs.offset || 0, (kwargs.offset || 0) + (kwargs.limit || rows.length)).map((row) => Object.fromEntries(kwargs.fields.map((field) => [field, row[field]]))) });
  }
  throw new Error(`Unmocked ${model}.${method}`);
};
const request = (body, session = "fixture") => new NextRequest("https://demo.fixture.invalid/api/odoo/records", {
  method: "POST", headers: { Origin: "https://demo.fixture.invalid", "x-forwarded-host": "demo.orithos.com.au", "Content-Type": "application/json", Cookie: `orithos_access_token=fixture; orithos_odoo_session=${session}` }, body: JSON.stringify(body),
});
const opts = { type: "products", catalogueView: "all", inventoryReport: true, sortBy: "qty_available", sortDirection: "desc", limit: 40 };
async function check(name, action) { await action(); checks.push({ name, status: "PASS" }); }
try {
  const { POST } = load(path.join(ui, "app/api/odoo/records/route.ts"));
  let first;
  await check("global ordering, complete totals, 500-row keyset scan and scoped snapshots", async () => {
    const response = await POST(request(opts)); assert.equal(response.status, 200);
    first = await response.json();
    assert.equal(first.totalItems, 1012); assert.equal(first.items.length, 40); assert.equal(first.items[0].id, 1012);
    assert.equal(first.totalQty, products.filter((p) => p.company_id === 41).reduce((sum, p) => sum + Math.max(0, p.qty_available), 0));
    assert.equal(first.totalStockValue, Math.round(products.filter((p) => p.company_id === 41).reduce((sum, p) => sum + p.qty_available, 0) * 2.005 * 100) / 100);
    assert.ok(first.snapshotId); assert.ok(first.items.every((p) => !("standard_price" in p)));
    assert.equal(first.items[0].shopfront_quantity, 0); assert.equal(first.items[0].shopfront_inventory_status, "available");
    assert.equal(first.items[0].shopfront_cost, 72.5); assert.equal(first.items[0].shopfront_case_quantity, 6);
    assert.equal(first.items[0].shopfront_source_category, "Red"); assert.notEqual(first.items[0].shopfront_quantity, first.items[0].qty_available);
  });
  await check("revisiting an identical query reuses its snapshot; explicit refresh creates a new one", async () => {
    const reused = await (await POST(request(opts))).json(); assert.equal(reused.snapshotId, first.snapshotId);
    const refreshed = await (await POST(request({ ...opts, refresh: true }))).json(); assert.notEqual(refreshed.snapshotId, first.snapshotId);
    assert.equal(refreshed.totalQty, first.totalQty);
  });
  await check("all appended pages remain unique and stable, totals do not depend on loaded count", async () => {
    const ids = first.items.map((p) => p.id);
    const reads = calls.filter((c) => c.model === "product.product").length;
    for (let offset = 40; offset < 1012; offset += 40) {
      const response = await POST(request({ ...opts, offset, snapshotId: first.snapshotId })); assert.equal(response.status, 200);
      const page = await response.json(); ids.push(...page.items.map((p) => p.id));
      assert.equal(page.totalQty, first.totalQty); assert.equal(page.totalStockValue, first.totalStockValue);
      assert.equal(page.hasNext, offset + 40 < 1012);
    }
    assert.equal(ids.length, 1012); assert.equal(new Set(ids).size, 1012);
    assert.equal(calls.filter((c) => c.model === "product.product").length, reads, "Appending reuses the scoped snapshot");
  });
  await check("search and category/quick filters change both rows and full totals", async () => {
    const response = await POST(request({ ...opts, query: "Wine 10", categoryIds: [1], catalogueView: "negative-stock" }));
    assert.equal(response.status, 200); const page = await response.json(); assert.equal(page.totalItems, 0); assert.equal(page.totalQty, 0);
    const negative = await (await POST(request({ ...opts, catalogueView: "negative-stock" }))).json(); assert.equal(negative.totalItems, 5); assert.equal(negative.totalQty, 0); assert.equal(negative.negativeStockItems, 5);
  });
  await check("category and true GST-inclusive price sort work globally", async () => {
    const category = await (await POST(request({ ...opts, sortBy: "category", sortDirection: "asc" }))).json(); assert.equal(category.items[0].id, 1);
    const price = await (await POST(request({ ...opts, sortBy: "price_included" }))).json(); assert.equal(price.items[0].price_included, 12.1);
    assert.ok(calls.filter((c) => c.model === "account.tax").length < 200, "Shared quotes are deduplicated");
  });
  await check("cost access denial preserves stock but never reports a partial value as a full total", async () => {
    costDenied = true; const page = await (await POST(request({ ...opts, refresh: true }))).json();
    assert.equal(page.totalStockValue, null); assert.equal(page.missingCostItems, 1012); assert.equal(page.totalQty, first.totalQty); costDenied = false;
  });
  await check("Shopfront cost stays hidden without the balances permission", async () => {
    permissions = ["stock.products.view"];
    const page = await (await POST(request({ ...opts, refresh: true }))).json();
    assert.equal(page.items[0].shopfront_cost, null); assert.equal(page.items[0].shopfront_cost_status, "restricted");
    assert.ok(page.items.every((item) => !("standard_price" in item)));
    permissions = ["stock.products.view", "customers.balances"];
  });
  await check("session, company, query and expired/unknown snapshot cannot be reused", async () => {
    assert.equal((await POST(request({ ...opts, offset: 40, snapshotId: first.snapshotId }, "other"))).status, 409);
    assert.equal((await POST(request({ ...opts, query: "other", offset: 40, snapshotId: first.snapshotId }))).status, 409);
    company = 42; assert.equal((await POST(request({ ...opts, offset: 40, snapshotId: first.snapshotId }))).status, 409); company = 41;
    assert.equal((await POST(request({ ...opts, snapshotId: "expired" }))).status, 409);
  });
  await check("sort injection and invalid report types are rejected; permission remains enforced", async () => {
    for (const extra of [{ sortBy: "name; DROP TABLE" }, { sortDirection: "bad" }, { type: "sales" }]) assert.equal((await POST(request({ ...opts, ...extra }))).status, 400);
    permissions = []; assert.equal((await POST(request(opts))).status, 403); permissions = ["stock.products.view"];
  });
  await check("Odoo failure is an error, never a fabricated empty result", async () => {
    unavailable = true; assert.equal((await POST(request({ ...opts, refresh: true }))).status, 502); unavailable = false;
  });
  console.log(`${checks.length}/${checks.length} PASS; no live network/business writes`);
} finally {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.ODOO_BASE_URL; else process.env.ODOO_BASE_URL = originalBase;
  fs.writeFileSync(path.join(root, "docs/UAT_INVENTORY_REPORT_ROUTE_LOCAL_2026-11-08.json"), JSON.stringify({ scope: "Actual route with in-memory Odoo transport; no live acceptance", liveBusinessWrites: 0, checks }, null, 2));
}
