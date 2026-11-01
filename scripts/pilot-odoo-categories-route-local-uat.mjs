/** Real route handlers with an in-memory Odoo transport. No live network/writes. */
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
  mod.require = (id) => id.startsWith("@/") ? load(path.join(ui, "src", id.slice(2)) + ".ts") : require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
  return mod.exports;
}
const originalFetch = globalThis.fetch;
const savedEnv = { ODOO_BASE_URL: process.env.ODOO_BASE_URL, ODOO_CATEGORY_WRITE_ENABLED: process.env.ODOO_CATEGORY_WRITE_ENABLED };
process.env.ODOO_BASE_URL = "https://categories.fixture.invalid";
process.env.ODOO_CATEGORY_WRITE_ENABLED = "true";
let permissions = ["stock.products.view", "stock.products.edit", "stock.products.import_export"];
let upgraded = true;
let categories = [
  { id: 1, name: "Wine", company_id: [41, "Fixture"], parent_id: false },
  { id: 2, name: "Shared", company_id: false, parent_id: false },
  { id: 3, name: "Foreign", company_id: [99, "Other"], parent_id: false },
  { id: 4, name: "Red", company_id: [41, "Fixture"], parent_id: [1, "Wine"] },
];
const writes = [];
const json = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
function matches(record, domain) {
  let cursor = 0;
  const expression = () => {
    const item = domain[cursor++];
    if (item === "|") { const a = expression(), b = expression(); return a || b; }
    if (item === "&") { const a = expression(), b = expression(); return a && b; }
    if (item === "!") return !expression();
    const [key, operator, expected] = item;
    const value = Array.isArray(record[key]) ? record[key][0] : record[key];
    if (operator === "=") return value === expected;
    if (operator === "!=") return value !== expected;
    if (operator === "in") return expected.includes(value);
    if (operator === "=ilike") return String(value).toLowerCase() === String(expected).toLowerCase();
    if (operator === "ilike") return String(value).toLowerCase().includes(String(expected).toLowerCase());
    throw new Error(`Unmocked domain ${operator}`);
  };
  const results = []; while (cursor < domain.length) results.push(expression());
  return results.every(Boolean);
}
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.endsWith("/api/auth/me")) return json({ code: 0, data: { permissions } });
  if (url.endsWith("/api/tenant/odoo-binding")) return json({ code: 0, data: { vendorId: 41, odooCompanyId: 41, odooProvisionStatus: "ready" } });
  if (url.endsWith("/web/session/get_session_info")) return json({ result: { uid: 1, user_context: { allowed_company_ids: [41, 99] } } });
  assert.ok(url.startsWith("https://categories.fixture.invalid/"), "No real network");
  const { params } = JSON.parse(options.body);
  const { model, method, args, kwargs } = params;
  assert.deepEqual(kwargs.context.allowed_company_ids, [41]);
  if (model === "pos.category" && method === "fields_get") return json({ result: upgraded ? { company_id: { type: "many2one" } } : {} });
  if (model === "pos.category" && method === "orithos_category_counts") return json({ result: Object.fromEntries(args[0].map((id) => [id, { productCount: id === 4 ? 1 : 0, childCount: id === 1 ? 1 : 0 }])) });
  if (model === "pos.category" && method === "search_read") return json({ result: categories.filter((record) => matches(record, args[0])).slice(kwargs.offset || 0, (kwargs.offset || 0) + (kwargs.limit || 100)) });
  if (model === "pos.category" && method === "search_count") return json({ result: categories.filter((record) => matches(record, args[0])).length });
  if (model === "product.template" && method === "search_count") {
    assert.equal(kwargs.context.active_test, false, "Archived product references are included");
    const id = args[0].find((term) => Array.isArray(term) && term[0] === "pos_categ_ids")[2][0];
    return json({ result: id === 4 ? 1 : 0 });
  }
  if (model === "product.product" && method === "search_count") {
    assert.ok(args[0].some((term) => JSON.stringify(term) === JSON.stringify(["company_id", "in", [41]])));
    assert.ok(args[0].some((term) => JSON.stringify(term) === JSON.stringify(["sale_ok", "=", true])));
    const ids = args[0].find((term) => Array.isArray(term) && term[0] === "pos_categ_ids")[2];
    assert.ok(ids.every((id) => [1, 4].includes(id)), "Only owned categories are counted");
    return json({ result: ids.includes(4) ? 1 : 0 });
  }
  if (model === "pos.category" && method === "create") { writes.push(params); categories.push({ id: 5, ...args[0], company_id: [args[0].company_id, "Fixture"] }); return json({ result: 5 }); }
  if (model === "pos.category" && method === "write") { writes.push(params); categories = categories.map((record) => args[0].includes(record.id) ? { ...record, ...args[1] } : record); return json({ result: true }); }
  if (model === "pos.category" && method === "unlink") { writes.push(params); categories = categories.filter((record) => !args[0].includes(record.id)); return json({ result: true }); }
  throw new Error(`Unmocked operation ${model}.${method}`);
};
const request = (method, suffix = "", body) => new NextRequest(`https://demo.fixture.invalid/api/odoo/categories${suffix}`, { method, headers: { Origin: "https://demo.fixture.invalid", "Content-Type": "application/json", Cookie: "orithos_access_token=fixture; orithos_odoo_session=fixture" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const checks = [];
async function check(name, action) { await action(); checks.push({ name, status: "PASS" }); }
try {
  const collection = load(path.join(ui, "app/api/odoo/categories/route.ts"));
  const detail = load(path.join(ui, "app/api/odoo/categories/[id]/route.ts"));
  const context = (id) => ({ params: Promise.resolve({ id: String(id) }) });
  await check("list includes only store categories, excludes shared and foreign even with multi-company service session", async () => {
    const response = await collection.GET(request("GET")); assert.equal(response.status, 200);
    const payload = await response.json(); assert.deepEqual(payload.items.map((item) => item.id), [1, 4]); assert.ok(payload.items.every((item) => item.editable));
  });
  await check("unified management rows expose only editable store categories with matching product counts", async () => {
    const response = await collection.GET(request("GET", "?view=unified")); assert.equal(response.status, 200);
    const payload = await response.json(); assert.deepEqual(payload.items.map((item) => item.id), [1, 4]);
    assert.ok(payload.items.every((item) => item.editable)); assert.equal(payload.items[1].productCount, 1);
  });
  await check("product category pickers and forged shared/foreign product filters respect ownership", async () => {
    const records = load(path.join(ui, "app/api/odoo/records/route.ts"));
    const response = await records.POST(request("POST", "", { type: "posCategories" })); assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).items.map((item) => item.id), [1, 4]);
    for (const filter of [{ categoryId: 2 }, { categoryIds: [1, 2] }, { categoryId: 3 }]) {
      assert.equal((await records.POST(request("POST", "", { type: "products", ...filter }))).status, 403);
    }
  });
  await check("new category is always assigned to tenant company", async () => { assert.equal((await collection.POST(request("POST", "", { name: "Spirits", parentId: null }))).status, 201); assert.equal(writes.at(-1).args[0].company_id, 41); });
  await check("duplicate category rejected", async () => { assert.equal((await collection.POST(request("POST", "", { name: "Spirits", parentId: null }))).status, 409); });
  await check("shared and foreign categories cannot be edited or deleted", async () => { for (const id of [2, 3]) { assert.equal((await detail.PATCH(request("PATCH", `/${id}`, { name: "Bad" }), context(id))).status, 404); assert.equal((await detail.DELETE(request("DELETE", `/${id}`), context(id))).status, 404); } });
  await check("cycles and foreign parents rejected", async () => { assert.equal((await detail.PATCH(request("PATCH", "/1", { name: "Wine", parentId: 4 }), context(1))).status, 409); assert.equal((await detail.PATCH(request("PATCH", "/1", { name: "Wine", parentId: 3 }), context(1))).status, 404); });
  await check("child and archived-product references prevent deletion", async () => { for (const id of [1, 4]) assert.equal((await detail.DELETE(request("DELETE", `/${id}`), context(id))).status, 409); });
  await check("own unused category can be renamed and deleted", async () => { assert.equal((await detail.PATCH(request("PATCH", "/5", { name: "Beer", parentId: null }), context(5))).status, 200); assert.equal((await detail.DELETE(request("DELETE", "/5"), context(5))).status, 200); });
  await check("category assignment accepts store IDs and rejects shared and foreign IDs", async () => { const scope = await load(path.join(ui, "src/lib/odoo-scope.ts")).scopedOdoo(request("GET")); const validate = load(path.join(ui, "src/lib/odoo-categories.ts")).validateCategoryIds; await validate(scope, [1, 4]); for (const ids of [[2], [3], [1, 2]]) await assert.rejects(validate(scope, ids), (error) => error.status === 403); });
  await check("view-only user cannot mutate categories", async () => { permissions = ["stock.products.view"]; assert.equal((await collection.POST(request("POST", "", { name: "No" }))).status, 403); permissions.push("stock.products.edit"); });
  await check("missing Odoo upgrade blocks category management", async () => { upgraded = false; assert.equal((await collection.GET(request("GET"))).status, 503); upgraded = true; });
  await check("write gate defaults closed", async () => { delete process.env.ODOO_CATEGORY_WRITE_ENABLED; assert.equal((await collection.POST(request("POST", "", { name: "No" }))).status, 503); });
  await check("invoice permission does not authorize confirming a purchase", async () => {
    permissions = ["stock.invoices"];
    const route = load(path.join(ui, "app/api/odoo/purchase-orders/[id]/route.ts"));
    assert.equal((await route.POST(request("POST", "/1", { confirm: true }), context(1))).status, 403);
  });
  await check("receive permission alone cannot bypass purchase authorization", async () => {
    permissions = ["stock.receive"];
    const route = load(path.join(ui, "app/api/odoo/purchase-orders/[id]/receive/route.ts"));
    assert.equal((await route.POST(request("POST", "/1", { confirm: true, pickingId: 1, lines: [{ moveId: 1, qtyDone: 1 }] }), context(1))).status, 403);
  });
  console.log(`${checks.length}/${checks.length} PASS; live network/writes 0`);
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  fs.writeFileSync(path.join(root, "docs/UAT_STORE_CATEGORIES_ROUTE_LOCAL_2026-11-02.json"), JSON.stringify({ scope: "real handlers with in-memory transport", liveBusinessWrites: 0, checks, fixtureWrites: writes.length }, null, 2));
}
