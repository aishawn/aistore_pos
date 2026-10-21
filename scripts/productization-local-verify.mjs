/** Runs real route handlers against an in-memory Odoo transport. No live requests or business writes. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = path.join(root, "pos-ui");
const require = createRequire(path.join(ui, "package.json"));
const ts = require("typescript");
const { NextRequest } = require("next/server");
const modules = new Map();
function load(file) {
  if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file, "utf8"));
  if (modules.has(file)) return modules.get(file).exports;
  const mod = new Module(file);
  modules.set(file, mod);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod.require = (id) => id.startsWith("@/") ? load(path.join(ui, "src", id.slice(2)) + (id.endsWith(".json") ? "" : ".ts")) : require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: file,
  }).outputText, file);
  return mod.exports;
}
const route = (name) => load(path.join(ui, "app/api", name, "route.ts"));
const checks = [];
async function test(name, run) {
  try { await run(); checks.push({ name, status: "PASS" }); }
  catch (error) { checks.push({ name, status: "FAIL", error: error.message }); }
}
const originalFetch = globalThis.fetch;
const originalEnvironment = { ...process.env };
process.env.ODOO_BASE_URL = "https://odoo.fixture.invalid";
process.env.BACKEND_URL = "https://backend.fixture.invalid";
let state;
function reset(overrides = {}) {
  state = { admin: true, company: 1, price: 12, taxIncluded: true, taxAmount: 10, taxType: "percent", taxIds: [11], count: 1, writes: 0, calls: [], savedOrder: true, ...overrides };
}
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  state.calls.push({ url, method: options.method ?? "GET" });
  if (url.endsWith("/api/auth/me")) return json({ code: 0, data: { isAdmin: state.admin } });
  if (url.endsWith("/api/tenant/odoo-binding")) return json({ code: 0, data: { vendorId: 1, odooCompanyId: state.company, odooProvisionStatus: "ready", odooStockLocationId: state.unboundLocation ? null : 9 } });
  if (url.endsWith("/web/session/get_session_info")) return json({ result: { uid: 1, user_context: { allowed_company_ids: [1] } } });
  if (url.endsWith("/api/public/version")) return json({ service: "orithos-backend", commit: "a".repeat(40), builtAt: "2026-10-21T00:00:00Z", secret: "must-not-appear" });
  if (url.endsWith("/api/public/uat-context")) return json({ isolated: true, database: "aipos_uat", commit: "a".repeat(40) });
  if (!url.endsWith("/web/dataset/call_kw")) throw new Error("Unexpected fixture URL");
  const { params } = JSON.parse(options.body);
  const { model, method, args, kwargs } = params;
  if (model === "pos.order.line" && method === "read_group") return json({ result: [] });
  if (model === "res.company") return json({ result: [{ name: "Fixture Store" }] });
  if (model === "account.tax" && method === "search_read") return json({ result: state.taxIds.map((id) => ({ id, amount: state.taxAmount, amount_type: state.taxType, price_include: state.taxIncluded, include_base_amount: false })) });
  if (model === "account.tax" && method === "compute_all") {
    assert.deepEqual(kwargs.context.allowed_company_ids, [1]);
    const price = args[1];
    const net = state.taxIncluded ? price / (1 + state.taxAmount / 100) : price;
    return json({ result: { total_excluded: Math.round(net * 100) / 100, total_included: Math.round(net * (1 + state.taxAmount / 100) * 100) / 100 } });
  }
  if (model === "product.product" && method === "search_read") {
    assert.ok(args[0].some((clause) => clause[0] === "company_id"), "Product reads must constrain company");
    if (state.inaccessibleProduct) return json({ result: [] });
    return json({ result: Array.from({ length: state.count }, (_, index) => ({ id: index + 1, name: `Product ${index + 1}`, list_price: state.price, standard_price: 10, taxes_id: state.taxIds, qty_available: 4, uom_id: [1, "Units"] })) });
  }
  if (model === "purchase.order" && method === "search_read") return json({ result: [{ id: 1, name: "PO1", state: "purchase", picking_ids: [7] }] });
  if (model === "stock.picking" && method === "fields_get") return json({ result: { move_ids: { type: "one2many" } } });
  if (model === "stock.picking" && method === "search_read") return json({ result: [{ id: 7, name: "IN/7", state: state.pickingState ?? "assigned", picking_type_code: "incoming", move_ids: [3, 4] }] });
  if (model === "stock.move" && method === "fields_get") return json({ result: { quantity: { type: "float" } } });
  if (model === "stock.move" && method === "search_read") return json({ result: [3, 4].map((id) => ({ id, product_uom_qty: 5, quantity: 0, product_id: [id, "Fixture"] })) });
  if (model === "stock.move" && method === "write") {
    state.writes++;
    if (state.loseMoveResponse) throw new Error("Response lost after partial move update");
    return json({ result: true });
  }
  if (model === "stock.picking" && method === "button_validate") {
    state.writes++;
    if (!state.incompleteReceipt) state.pickingState = "done";
    if (state.loseValidateResponse) throw new Error("Response lost after validation");
    return json({ result: true });
  }
  if (model === "stock.warehouse") return json({ result: [{ id: 1, lot_stock_id: [9, "Stock"], company_id: [1, "Fixture"] }] });
  if (model === "stock.location") return json({ result: [{ id: 9, complete_name: "WH/Stock", usage: "internal", company_id: [1, "Fixture"], location_id: false }] });
  if (model === "stock.quant" && method === "search_read") return json({ result: [{ id: 1, product_id: [1, "Fixture"], quantity: state.quantity ?? 4, lot_id: false, package_id: false, owner_id: false, inventory_quantity_set: false }] });
  if (model === "stock.quant" && method === "create") {
    state.writes++; state.quantity = args[0][0].inventory_quantity_auto_apply;
    if (state.loseQuantResponse) throw new Error("Response lost after inventory commit");
    return json({ result: [1] });
  }
  if (model === "product.product" && method === "write") {
    assert.deepEqual(kwargs.context.allowed_company_ids, [1]);
    state.writes++; state.price = args[1].list_price;
    if (state.loseWriteResponse) throw new Error("Fixture response lost after commit");
    return json({ result: true });
  }
  if (model === "pos.order") {
    assert.ok(args[0].some((clause) => clause[0] === "company_id"));
    assert.ok(args[0].some((clause) => clause[0] === "config_id"));
    return json({ result: state.savedOrder ? [{ id: 42, name: "Fixture receipt", state: "paid", amount_total: 11, amount_tax: 1, amount_paid: 11, amount_return: 9, lines: [], session_id: [1, "Fixture session"], date_order: "2026-10-21 00:00:00" }] : [] });
  }
  throw new Error(`Unexpected fixture method ${model}.${method}`);
};
function request(url = "/api/odoo/price-suggestions", body) {
  return new NextRequest(`https://demo.fixture.invalid${url}`, {
    method: body ? "PATCH" : "GET", headers: { cookie: "orithos_access_token=fixture; orithos_odoo_session=fixture", host: "demo.fixture.invalid" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
try {
  const suggestions = route("odoo/price-suggestions");
  await test("GST-inclusive prices use net margin and Odoo tax totals", async () => {
    reset(); const response = await suggestions.GET(request()); const data = await response.json();
    assert.equal(response.status, 200); assert.equal(data.writeEnabled, false);
    const product = data.products[0];
    assert.equal(product.suggestedPrice, 15.75); assert.equal(product.suggestedNetPrice, 14.32);
    assert.equal(product.suggestedGst, 1.43); assert.ok(product.suggestedMargin >= 0.3);
    assert.equal(product.marginBasis, "net_sales_excluding_gst"); assert.equal(state.writes, 0);
  });
  await test("GST-exclusive Odoo list price is distinct from shelf price", async () => {
    reset({ taxIncluded: false }); const data = await (await suggestions.GET(request())).json();
    assert.equal(data.products[0].suggestedListPrice, 14.29); assert.equal(data.products[0].suggestedPrice, 15.72);
  });
  await test("Explicit zero-rate tax is supported without assuming GST", async () => {
    reset({ taxAmount: 0, taxIncluded: false }); const data = await (await suggestions.GET(request())).json();
    assert.equal(data.products[0].suggestedGst, 0); assert.equal(data.products[0].suggestedPrice, 14.29);
  });
  for (const scenario of [{ taxIds: [] }, { taxType: "fixed" }, { taxAmount: -10 }]) {
    await test(`Missing or unsupported tax suppresses prices: ${JSON.stringify(scenario)}`, async () => {
      reset(scenario); const data = await (await suggestions.GET(request())).json();
      assert.equal(data.products[0].status, "review_tax"); assert.equal(data.products[0].suggestedPrice, null);
      assert.equal(data.products[0].currentMargin, null);
    });
  }
  await test("Cashier cannot retrieve cost or price suggestions", async () => {
    reset({ admin: false }); const response = await suggestions.GET(request());
    assert.equal(response.status, 403); assert.equal(state.calls.length, 1);
  });
  await test("Pagination exposes a continuation instead of truncating silently", async () => {
    reset({ count: 31 }); const data = await (await suggestions.GET(request())).json();
    assert.equal(data.products.length, 30); assert.equal(data.nextOffset, 30); assert.equal(data.truncated, true);
  });
  await test("Malformed page offset is rejected", async () => {
    reset(); assert.equal((await suggestions.GET(request("/api/odoo/price-suggestions?offset=-1"))).status, 400);
  });
  const products = route("odoo/products/[id]");
  const context = { params: Promise.resolve({ id: "1" }) };
  await test("Cross-company product IDs cannot be updated", async () => {
    reset({ inaccessibleProduct: true }); const response = await products.PATCH(request("/api/odoo/products/1", { list_price: 15 }), context);
    assert.equal(response.status, 404); assert.equal(state.writes, 0);
  });
  await test("Changed original price rejects a stale suggestion", async () => {
    reset(); const response = await products.PATCH(request("/api/odoo/products/1", { list_price: 15, expectedListPrice: 11 }), context);
    assert.equal(response.status, 409); assert.equal(state.writes, 0);
  });
  await test("Confirmed price save reads back Odoo and uses company context", async () => {
    reset(); const response = await products.PATCH(request("/api/odoo/products/1", { list_price: 15, expectedListPrice: 12 }), context);
    assert.equal(response.status, 200); assert.equal((await response.json()).resultState, "confirmed"); assert.equal(state.writes, 1);
  });
  await test("Lost price-write response is unknown; GET safely reconciles without a second write", async () => {
    reset({ loseWriteResponse: true }); const response = await products.PATCH(request("/api/odoo/products/1", { list_price: 15, expectedListPrice: 12 }), context);
    assert.equal(response.status, 502); assert.equal((await response.json()).resultState, "unknown");
    assert.equal((await (await products.GET(request("/api/odoo/products/1"), context)).json()).list_price, 15); assert.equal(state.writes, 1);
  });
  await test("Cashier cannot mutate products through a shared Odoo account", async () => {
    reset({ admin: false }); assert.equal((await products.PATCH(request("/api/odoo/products/1", { list_price: 15 }), context)).status, 403); assert.equal(state.writes, 0);
  });
  await test("Checkout recovery is read-only and tenant/config constrained", async () => {
    reset(); const response = await route("odoo/checkout/status").GET(request("/api/odoo/checkout/status?configId=1&orderUuid=11111111-1111-4111-8111-111111111111"));
    const data = await response.json(); assert.equal(data.resultState, "confirmed"); assert.equal(data.result.total, 11); assert.equal(data.result.change, 9); assert.equal(data.result.tendered, 20); assert.equal(state.writes, 0);
  });
  await test("Missing checkout remains pending and cannot trigger a replay", async () => {
    reset({ savedOrder: false }); const response = await route("odoo/checkout/status").GET(request("/api/odoo/checkout/status?configId=1&orderUuid=11111111-1111-4111-8111-111111111111"));
    assert.equal((await response.json()).resultState, "unknown"); assert.equal(state.writes, 0);
  });
  await test("Tenant binding outside the Odoo session fails closed", async () => {
    reset({ company: 2 }); assert.equal((await route("odoo/checkout/status").GET(request("/api/odoo/checkout/status?configId=1&orderUuid=11111111-1111-4111-8111-111111111111"))).status, 403);
  });
  const receive = route("odoo/purchase-orders/[id]/receive");
  const receiveBody = { confirm: true, pickingId: 7, lines: [{ moveId: 3, qtyDone: 2 }, { moveId: 4, qtyDone: 0 }] };
  await test("Receipt identity is required; retry cannot select a backorder", async () => {
    reset(); const { pickingId, ...body } = receiveBody;
    assert.equal((await receive.POST(request("/api/odoo/purchase-orders/1/receive", body), context)).status, 400); assert.equal(state.writes, 0);
  });
  await test("Completed receipt retries return read-only confirmation", async () => {
    reset({ pickingState: "done" }); const data = await (await receive.POST(request("/receive", receiveBody), context)).json();
    assert.equal(data.resultState, "already_completed"); assert.equal(state.writes, 0);
  });
  await test("Partial receipt requires explicit zero quantities for remaining moves", async () => {
    reset(); assert.equal((await receive.POST(request("/receive", { ...receiveBody, lines: [receiveBody.lines[0]] }), context)).status, 409); assert.equal(state.writes, 0);
  });
  await test("Lost receipt validation response is recovered without replay", async () => {
    reset({ loseValidateResponse: true }); const data = await (await receive.POST(request("/receive", receiveBody), context)).json();
    assert.equal(data.resultState, "confirmed"); assert.equal(state.writes, 3);
  });
  for (const scenario of [{ incompleteReceipt: true }, { loseMoveResponse: true }]) {
    await test(`Unfinished receipt is unknown instead of success: ${JSON.stringify(scenario)}`, async () => {
      reset(scenario); const response = await receive.POST(request("/receive", receiveBody), context);
      assert.equal(response.status, 502); assert.equal((await response.json()).resultState, "unknown");
    });
  }
  await test("Cross-company and cashier receipt access fails before writes", async () => {
    reset({ company: 2 }); assert.equal((await receive.POST(request("/receive", receiveBody), context)).status, 403); assert.equal(state.writes, 0);
    reset({ admin: false }); assert.equal((await receive.POST(request("/receive", receiveBody), context)).status, 403); assert.equal(state.writes, 0);
  });
  const stocktake = route("odoo/stocktake");
  const countBody = { confirm: true, locationId: 9, lines: [{ productId: 1, expectedQty: 4, countedQty: 6 }] };
  process.env.ODOO_STOCKTAKE_WRITE_ENABLED = "true";
  await test("Unbound stock location cannot accept adjustments", async () => {
    reset({ unboundLocation: true }); assert.equal((await stocktake.POST(request("/stocktake", countBody))).status, 409); assert.equal(state.writes, 0);
  });
  await test("Concurrent stock movement rejects stale count", async () => {
    reset({ quantity: 5 }); assert.equal((await stocktake.POST(request("/stocktake", countBody))).status, 409); assert.equal(state.writes, 0);
  });
  await test("Already matching count observes state without another adjustment", async () => {
    reset({ quantity: 6 }); const response = await stocktake.POST(request("/stocktake", countBody)); assert.equal(response.status, 200); assert.equal((await response.json()).data.applied, 0); assert.equal(state.writes, 0);
  });
  await test("Lost inventory write response remains unknown with preserved identity", async () => {
    reset({ loseQuantResponse: true }); const response = await stocktake.POST(request("/stocktake", countBody)); assert.equal(response.status, 502); assert.equal((await response.json()).code, 50290); assert.equal(state.writes, 1);
  });
  await test("Runtime version response whitelists public metadata", async () => {
    reset(); const data = await (await route("public/version").GET()).json();
    assert.equal(data.frontend.commit, null); assert.equal(data.backend.commit, "a".repeat(40)); assert.equal("secret" in data.backend, false);
  });
  await test("Local database variables cannot attest a production runtime", async () => {
    reset(); process.env.ODOO_DATABASE = "aipos"; process.env.ISOLATION_ODOO_DATABASE = "aipos"; process.env.RUNTIME_ENVIRONMENT = "uat";
    const response = await route("odoo/uat-context").GET(request()); assert.equal(response.status, 409); assert.equal((await response.json()).isolated, false);
  });
  await test("Both services must explicitly agree on a dedicated UAT database", async () => {
    reset(); process.env.ODOO_DATABASE = "aipos_uat"; process.env.ISOLATION_ODOO_DATABASE = "aipos_uat"; process.env.RUNTIME_ENVIRONMENT = "uat";
    const response = await route("odoo/uat-context").GET(request()); assert.equal(response.status, 200); assert.equal((await response.json()).isolated, true);
  });
} finally {
  globalThis.fetch = originalFetch;
  for (const key of ["ODOO_BASE_URL", "BACKEND_URL", "ODOO_DATABASE", "ISOLATION_ODOO_DATABASE", "RUNTIME_ENVIRONMENT", "ODOO_STOCKTAKE_WRITE_ENABLED"]) {
    if (originalEnvironment[key] === undefined) delete process.env[key]; else process.env[key] = originalEnvironment[key];
  }
}
const failed = checks.filter((item) => item.status === "FAIL");
const evidence = { generatedAt: new Date().toISOString(), sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), sourceWorkingTree: true, nodeVersion: process.version, environment: "local-route-fixtures", scope: "Real TypeScript route handlers; all network intercepted; no live Odoo writes; no deployment or hardware acceptance", status: failed.length ? "FAIL" : "PASS", passed: checks.length - failed.length, failed: failed.length, checks };
fs.writeFileSync(path.join(root, "docs/UAT_PRODUCTIZATION_LOCAL_2026-10-21.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(`${evidence.passed}/${checks.length} PASS`);
for (const item of failed) console.error(`${item.name}: ${item.error}`);
if (failed.length) process.exitCode = 1;
