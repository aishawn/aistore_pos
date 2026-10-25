/** Exercise the real Next route with an in-memory Odoo transport; no network. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
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
  const mod = new Module(file);
  modules.set(file, mod);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod.require = (id) => id.startsWith("@/") ? load(path.join(ui, "src", id.slice(2)) + ".ts") : require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
  return mod.exports;
}
const originalFetch = globalThis.fetch;
const originalBase = process.env.ODOO_BASE_URL;
process.env.ODOO_BASE_URL = "https://catalogue.fixture.invalid";
let calls = [], foreignCompany = false, productPermission = true;
const json = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.endsWith("/api/auth/me")) return json({ code: 0, data: { permissions: productPermission ? ["stock.products.view"] : [] } });
  if (url.endsWith("/api/tenant/odoo-binding")) return json({ code: 0, data: { vendorId: 41, odooCompanyId: foreignCompany ? 99 : 41, odooProvisionStatus: "ready" } });
  if (url.endsWith("/web/session/get_session_info")) return json({ result: { uid: 1, user_context: { allowed_company_ids: [41] } } });
  assert.ok(url.startsWith("https://catalogue.fixture.invalid/"), "No real transport allowed");
  const { params } = JSON.parse(options.body);
  assert.equal(params.method, "search_read", "No business writes");
  calls.push(params);
  return json({ result: Array.from({ length: 42 }, (_, index) => ({ id: index + 1, list_price: 12, taxes_id: [] })) });
};
const checks = [];
try {
  const { POST } = load(path.join(ui, "app/api/odoo/records/route.ts"));
  const request = (body, headers = {}) => POST(new NextRequest("https://demo.fixture.invalid/api/odoo/records", { method: "POST", headers: { "Content-Type": "application/json", Cookie: "orithos_odoo_session=fixture; orithos_access_token=fixture", ...headers }, body: JSON.stringify(body) }));
  const clauses = { all: ["sale_ok", "=", true], "out-of-stock": ["qty_available", "=", 0], "negative-stock": ["qty_available", "<", 0], "zero-price": ["list_price", "=", 0], "missing-barcode": ["barcode", "=", false], uncategorised: ["pos_categ_ids", "=", false], hidden: ["available_in_pos", "=", false] };
  for (const [view, clause] of Object.entries(clauses)) {
    const response = await request({ type: "products", catalogueView: view, limit: 40, offset: 40, query: "Shiraz", categoryId: 7 });
    assert.equal(response.status, 200);
    const result = await response.json(), rpc = calls.at(-1), domain = rpc.args[0];
    assert.ok(domain.some((item) => JSON.stringify(item) === JSON.stringify(clause)));
    assert.ok(domain.some((item) => JSON.stringify(item) === JSON.stringify(["company_id", "in", [41]])));
    assert.ok(domain.some((item) => JSON.stringify(item) === JSON.stringify(["pos_categ_ids", "in", [7]])));
    assert.ok(domain.some((item) => JSON.stringify(item) === JSON.stringify(["barcode", "ilike", "Shiraz"])));
    assert.deepEqual(rpc.kwargs.context.allowed_company_ids, [41]);
    assert.equal(rpc.kwargs.offset, 40);
    assert.equal(rpc.kwargs.limit, 41);
    assert.equal(result.items.length, 40);
    assert.equal(result.hasNext, true);
    assert.ok(!domain.some((item) => JSON.stringify(item) === JSON.stringify(["available_in_pos", "=", true])));
    checks.push(`${view}: scoped server filtering, search/category composition and pagination`);
  }
  await request({ type: "products" });
  assert.ok(calls.at(-1).args[0].some((item) => JSON.stringify(item) === JSON.stringify(["available_in_pos", "=", true])));
  checks.push("cashier defaults remain POS-only");
  for (const body of [{ type: "products", catalogueView: "bad" }, { type: "customers", catalogueView: "hidden" }]) {
    const before = calls.length;
    assert.equal((await request(body)).status, 400);
    assert.equal(calls.length, before);
    checks.push(`reject ${body.type}/${body.catalogueView}`);
  }
  assert.equal((await request({ type: "products", catalogueView: "all" }, { Origin: "https://foreign.invalid" })).status, 403);
  checks.push("cross-origin rejected");
  productPermission = false;
  assert.equal((await request({ type: "products", catalogueView: "hidden" })).status, 403);
  checks.push("hidden catalogue requires application product permission");
  productPermission = true;
  foreignCompany = true;
  const before = calls.length;
  assert.equal((await request({ type: "products", catalogueView: "all" })).status, 403);
  assert.equal(calls.length, before);
  checks.push("foreign company rejected before product read");
  fs.writeFileSync(path.join(root, "docs/UAT_PRODUCT_CATALOGUE_ROUTE_LOCAL_2026-10-24.json"), JSON.stringify({ sourceHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), sourceTreeDirty: true, scope: "Real route with in-memory transport; no live Odoo acceptance", businessWrites: 0, checks }, null, 2));
  console.log(`${checks.length}/${checks.length} PASS; no network or business writes`);
} finally {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.ODOO_BASE_URL;
  else process.env.ODOO_BASE_URL = originalBase;
}
