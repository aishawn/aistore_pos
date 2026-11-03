/** Actual GET handler with in-memory read-only RPC transport; no live network. */
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
  mod.require = (id) => id.startsWith("@/") ? load(path.join(ui, "src", id.slice(2)) + ".ts") : id.startsWith(".") && id.endsWith(".ts") ? load(path.resolve(path.dirname(file), id)) : require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
  return mod.exports;
}
const { GET } = load(path.join(ui, "app/api/odoo/reporting-dashboard/route.ts"));
const originalFetch = globalThis.fetch, OriginalDate = Date;
const fixed = "2026-11-03T03:00:00Z";
globalThis.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return OriginalDate.parse(fixed); } };
process.env.ODOO_BASE_URL = "https://reports.fixture.invalid";
const calls = [], checks = [];
const json = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.endsWith("/api/tenant/odoo-binding")) return json({ code: 0, data: { odooCompanyId: 41, odooProvisionStatus: "ready" } });
  assert.ok(url.startsWith("https://reports.fixture.invalid/"), "No live network");
  if (url.endsWith("/web/session/get_session_info")) return json({ result: { uid: 17, user_context: { allowed_company_ids: [41, 42] } } });
  const { model, method, args, kwargs } = JSON.parse(options.body).params;
  assert.ok(["search_read", "search_count", "read_group"].includes(method), "Read-only RPC");
  calls.push({ model, method, args, kwargs });
  if (model === "res.company") return json({ result: [{ name: "Fixture store", currency_id: [1, "AUD"], partner_id: [1, "Store"] }] });
  if (model === "res.partner") return json({ result: [{ country_id: [1, "Australia"], state_id: [1, "SA"] }] });
  if (model === "pos.session") return json({ result: 1 });
  const field = model === "pos.order.line" ? "order_id.date_order" : "date_order";
  const from = args[0].find(c => Array.isArray(c) && c[0] === field && c[1] === ">=")[2];
  const toClause = args[0].find(c => Array.isArray(c) && c[0] === field && ["<", "<="].includes(c[1]));
  const matches = [from, toClause[2]].filter(date => date >= from && (toClause[1] === "<" ? date < toClause[2] : date <= toClause[2]));
  if (method === "search_count") return json({ result: matches.length });
  if (method === "search_read") return json({ result: [] });
  return json({ result: [{ amount_total: matches.length * 100, amount_tax: 9.09, qty: matches.length * 5, __count: matches.length }] });
};
const request = (query, cookie = "orithos_odoo_session=fixture; orithos_access_token=fixture") => new NextRequest(`https://demo.fixture.invalid/api/odoo/reporting-dashboard?${query}`, { headers: { cookie } });
try {
  for (const [period, from, to, compareFrom, compareTo, granularity] of [
    ["yesterday", "2026-11-01 13:30:00", "2026-11-02 13:30:00", "2026-10-25 13:30:00", "2026-10-26 13:30:00", "hour"],
    ["last_week", "2026-10-25 13:30:00", "2026-11-01 13:30:00", "2026-10-18 13:30:00", "2026-10-25 13:30:00", "day"],
    ["last_month", "2026-09-30 14:30:00", "2026-10-31 13:30:00", "2026-08-31 14:30:00", "2026-09-30 14:30:00", "day"],
  ]) {
    calls.length = 0;
    const response = await GET(request(`period=${period}&hours=4320`));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual([body.period, body.from, body.to, body.compare.from, body.compare.to, body.trendGranularity], [period, from, to, compareFrom, compareTo, granularity]);
    assert.equal(body.transactions, 1); assert.equal(body.itemsSold, 5); assert.equal(body.compare.itemsSold, 5); assert.equal(body.revenue, 100);
    for (const call of calls.filter(c => ["pos.order", "pos.order.line"].includes(c.model))) {
      const field = call.model === "pos.order.line" ? "order_id.date_order" : "date_order";
      const company = call.model === "pos.order.line" ? "order_id.company_id" : "company_id";
      assert.ok(call.args[0].some(c => c[0] === company && c[2] === 41));
      const start = call.args[0].find(c => c[0] === field && c[1] === ">=")[2];
      const end = call.args[0].find(c => c[0] === field && c[1] === "<")[2];
      assert.ok((start === from && end === to) || (start === compareFrom && end === compareTo));
    }
    checks.push(`${period}: exact current/comparison domains, boundary exclusion, company scope, granularity`);
  }
  for (const hours of [8, 24, 168, 720, 2160, 4320]) {
    const response = await GET(request(`hours=${hours}`)); const body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.rangeHours, hours); assert.equal(body.period, "rolling");
  }
  checks.push("All six legacy hours ranges retained");
  const thisWeek = await (await GET(request("period=this_week"))).json();
  assert.equal(thisWeek.period, "this_week"); assert.equal(thisWeek.from, "2026-11-01 13:30:00");
  checks.push("Existing this_week retained");
  assert.equal((await GET(request("period=yesterday", ""))).status, 401);
  checks.push("Missing session rejected");
  fs.writeFileSync(path.join(root, "docs/UAT_REPORTS_PERIOD_ROUTE_LOCAL_2026-11-03.json"), JSON.stringify({ target: "actual GET handler with in-memory RPC transport", status: "PASS", checks, businessWrites: 0, liveOdooVerified: false }, null, 2));
  console.log(JSON.stringify({ status: "PASS", checks }));
} finally { globalThis.fetch = originalFetch; globalThis.Date = OriginalDate; }
