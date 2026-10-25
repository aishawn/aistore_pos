/** Real route handlers, in-memory Odoo transport only; never contacts a live system. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = path.join(root, "pos-ui"), require = createRequire(path.join(ui, "package.json"));
const ts = require("typescript"), { NextRequest } = require("next/server"), cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file); cache.set(file, mod); mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod.require = (id) => id.startsWith("@/") ? load(path.join(ui, "src", id.slice(2)) + ".ts") : require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
  return mod.exports;
}
const routes = (name) => load(path.join(ui, "app/api/odoo", name, "route.ts"));
let permissions = ["customers.view", "customers.edit", "customers.groups", "customers.balances", "customers.gift_cards", "customers.pricelists", "sell.checkout"];
let foreign = false, fallback = false, loyalty = "ready", price = 8, bridge = true, appliedOrder = null;
let writeCalls = 0, usedGroups = 1;
let cash = true, giftDate = "2020-01-01", configuredPlans = true, invalidPrices = false;
const calls = [], checks = [];
const originalFetch = globalThis.fetch, originalBase = process.env.ODOO_BASE_URL;
process.env.ODOO_BASE_URL = "https://customer.fixture.invalid";
const json = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const success = (result) => json({ result });
const failure = (name, message) => json({ error: { message: "Odoo error", data: { name, message } } });
const partners = Array.from({ length: 675 }, (_, i) => ({ id: i + 1, name: `Customer ${String(i + 1).padStart(4, "0")}`, company_id: [41, "Store"], customer_rank: 1, phone: "", email: "", ref: "", credit: i % 3 === 0 ? 25 : 0, total_invoiced: 50, property_product_pricelist: [3, "Members"], category_id: [4] }));
partners.push({ ...partners[0], id: 999, company_id: [99, "Other store"], name: "Foreign customer" });
function field(row, key) { return key.split(".").reduce((value, name) => value?.[name], row); }
function matches(row, domain) {
  let cursor = 0;
  function parse() {
    const token = domain[cursor++];
    if (token === "|") { const a = parse(), b = parse(); return a || b; }
    if (token === "&") { const a = parse(), b = parse(); return a && b; }
    if (token === "!") return !parse();
    if (Array.isArray(token) && Array.isArray(token[0])) return matches(row, token);
    const [key, op, value] = token;
    const actual = field(row, key), normalized = Array.isArray(actual) && typeof actual[1] === "string" ? actual[0] : actual;
    if (op === "=") return Array.isArray(normalized) ? normalized.includes(value) : normalized === value;
    if (op === "!=") return normalized !== value;
    if (op === ">") return normalized > value;
    if (op === "in") return Array.isArray(normalized) ? normalized.some((v) => value.includes(v)) : value.includes(normalized);
    if (op === "ilike") return String(normalized ?? "").toLowerCase().includes(String(value).toLowerCase());
    throw new Error(`Unhandled domain ${JSON.stringify(token)}`);
  }
  let result = true;
  while (cursor < domain.length) { const next = parse(); result = result && next; }
  return result;
}
const company = { id: 41, currency_id: [1, "AUD"], country_id: [1, "Australia"], state_id: [1, "South Australia"] };
const config = { id: 2, name: "Register", company_id: [41, "Store"], current_session_id: [5, "Session"], payment_method_ids: [1], pricelist_id: [3, "Members"], currency_id: [1, "AUD"], cash_rounding: true, only_round_cash_method: true, rounding_method: [1, "5 cents"], default_fiscal_position_id: false };
const product = { id: 10, name: "Wine", lst_price: 12, company_id: [41, "Store"], taxes_id: [1], available_in_pos: true, free_qty: 10000, uom_id: [1, "Bottle"] };
function page(rows, kwargs) { return rows.slice(kwargs.offset || 0, kwargs.limit ? (kwargs.offset || 0) + kwargs.limit : undefined); }
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.endsWith("/api/auth/me")) return json({ code: 0, data: { permissions } });
  if (url.endsWith("/api/tenant/odoo-binding")) return json({ code: 0, data: { vendorId: 41, odooCompanyId: foreign ? 99 : 41, odooProvisionStatus: "ready" } });
  assert.ok(url.startsWith("https://customer.fixture.invalid/"), `Unexpected network: ${url}`);
  if (url.endsWith("/web/session/get_session_info")) return success({ uid: 1, user_context: { allowed_company_ids: [41] } });
  const { params } = JSON.parse(options.body), { model, method, args, kwargs = {} } = params;
  calls.push(params);
  if (method === "orithos_quote_prices") {
    assert.deepEqual(kwargs.context.allowed_company_ids, [41]);
    if (!bridge) return failure("builtins.AttributeError", "Missing method");
    assert.deepEqual(args[1], [{ productId: 10, quantity: 13 }]);
    return success({ prices: invalidPrices ? [] : [{ productId: 10, unitPrice: price }], pricelistId: 3, priceSource: args[2] ? "customer" : "register", priceSourceName: "Members", currency: "AUD" });
  }
  if (model === "account.tax" && method === "compute_all") return success({ total_excluded: args[1] * args[3] / 1.1, total_included: args[1] * args[3] });
  if (model === "pos.order" && method === "sync_from_ui") {
    writeCalls++; appliedOrder = args[0][0];
    return success({ "pos.order": [{ id: 901, name: appliedOrder.name, pos_reference: "Fixture receipt", uuid: appliedOrder.uuid, amount_total: appliedOrder.amount_total, amount_tax: appliedOrder.amount_tax }] });
  }
  if (["create", "write", "unlink"].includes(method)) { writeCalls++; return success(method === "create" ? 800 : true); }
  if (model === "loyalty.card" && loyalty !== "ready") {
    if (loyalty === "missing") return failure("builtins.KeyError", "'loyalty.card'");
    if (loyalty === "denied") return failure("odoo.exceptions.AccessError", "Denied");
    return new Response("unavailable", { status: 503 });
  }
  let rows;
  if (model === "res.partner") {
    if (method === "search_count") { assert.ok(!("active_test" in kwargs)); if (args[0].length === 1) assert.equal(kwargs.context.active_test, false); return success(usedGroups); }
    if (fallback && args[0].some((clause) => Array.isArray(clause) && clause[0] === "credit")) return failure("odoo.exceptions.UserError", "Non-stored credit cannot be searched");
    rows = partners.filter((row) => matches(row, args[0]));
  } else if (model === "res.company") rows = [company];
  else if (model === "res.partner.category") rows = [{ id: 4, name: "Members", company_id: [41, "Store"], color: 0, parent_id: false }].filter((row) => matches(row, args[0]));
  else if (model === "product.pricelist") rows = [{ id: 3, name: "Members", company_id: [41, "Store"], active: true, currency_id: [1, "AUD"] }].filter((row) => matches(row, args[0]));
  else if (model === "account.move") rows = Array.from({ length: 56 }, (_, i) => ({ id: i + 1, name: `Invoice ${i + 1}`, move_type: i === 0 ? "out_refund" : "out_invoice", amount_total: 22, amount_residual: 11, payment_state: "partial", state: "posted", invoice_date: "2026-10-01", invoice_date_due: "2026-10-30", currency_id: [1, i === 0 ? "NZD" : "AUD"] }));
  else if (model === "loyalty.card") {
    if (method === "search_count") return success(2);
    rows = [{ id: 1, code: "GIFT", points: 50, program_id: [1, "Gifts"], program: undefined, company_id: 41, partner_id: false, expiration_date: giftDate }, { id: 2, code: "POINTS", points: 100, company_id: 41, program_id: [2, "Points"], partner_id: false, expiration_date: false }].map((row) => ({ ...row, program_id: Object.assign(row.program_id, { program_type: row.id === 1 ? "gift_card" : "loyalty" }) })).filter((row) => matches(row, args[0]));
  } else if (model === "loyalty.program") rows = configuredPlans ? [{ id: 1, name: "Gifts", currency_id: [1, "AUD"] }] : [];
  else if (model === "pos.config") rows = [config];
  else if (model === "pos.session") rows = [{ id: 5, state: "opened" }];
  else if (model === "pos.payment.method") rows = [{ id: 1, is_cash_count: cash, type: cash ? "cash" : "bank", name: "Cash" }];
  else if (model === "account.cash.rounding") rows = [{ id: 1, rounding: 0.05, rounding_method: "HALF-UP" }];
  else if (model === "product.product") rows = [product];
  else if (model === "pos.order") rows = args[0].some((clause) => clause[0] === "id" && clause[2] === 777) ? [{ id: 777, state: "paid", company_id: [41, "Store"], config_id: [2, "Register"], lines: [123], amount_total: 10, pricelist_id: [3, "Members"], fiscal_position_id: false, partner_id: [1, "Customer 0001"] }] : [];
  else if (model === "pos.order.line") rows = [{ id: 123, product_id: [10, "Wine"], qty: 1, refunded_qty: 0, price_unit: 10, discount: 0, tax_ids: [1] }];
  else if (model === "product.pricelist.item") rows = [];
  else throw new Error(`Unhandled ${model}.${method}`);
  return success(page(rows, kwargs).map((row) => kwargs.fields ? Object.fromEntries(kwargs.fields.map((key) => [key, row[key]])) : row));
};
function request(name, method = "GET", body, query = "", id) {
  const req = new NextRequest(`https://demo.fixture.invalid/api/odoo/${name}${query}`, { method, headers: { "Content-Type": "application/json", Cookie: "orithos_odoo_session=fixture; orithos_access_token=fixture" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return routes(name)[method](req, { params: Promise.resolve({ id: String(id || 1) }) });
}
async function check(name, run) { await run(); checks.push(name); console.log(`PASS ${name}`); }
try {
  await check("receivables >500 stable pagination and company isolation", async () => {
    const ids = [];
    for (let offset = 0; offset < 700; offset += 100) { const r = await request("customer-balances", "GET", null, `?limit=100&offset=${offset}`); assert.equal(r.status, 200); const data = await r.json(); ids.push(...data.items.map((row) => row.id)); if (!data.hasNext) break; }
    assert.deepEqual(ids, partners.slice(0, 675).map((row) => row.id)); assert.equal(new Set(ids).size, 675);
  });
  await check("non-stored credit fallback scans beyond 500 without omissions", async () => {
    fallback = true; const ids = [];
    for (let offset = 0; offset < 300; offset += 40) { const r = await request("customer-balances", "GET", null, `?owingOnly=true&limit=40&offset=${offset}`); assert.equal(r.status, 200); const data = await r.json(); ids.push(...data.items.map((row) => row.id)); if (!data.hasNext) break; }
    assert.deepEqual(ids, partners.slice(0, 675).filter((row) => row.credit > 0).map((row) => row.id)); fallback = false;
  });
  await check("invoice pagination >50, credit sign and native currency", async () => {
    const a = await (await request("customer-balances/[id]/invoices", "GET", null, "?offset=0", 1)).json();
    const b = await (await request("customer-balances/[id]/invoices", "GET", null, "?offset=50", 1)).json();
    assert.equal(a.items.length, 50); assert.equal(a.hasNext, true); assert.equal(b.items.length, 6); assert.equal(b.hasNext, false); assert.equal(a.items[0].amountResidual, -11); assert.equal(a.items[0].currency, "NZD");
  });
  await check("customer search hides receivables without balance permission", async () => {
    permissions = ["customers.view"]; const r = await request("records", "POST", { type: "customers", groupId: 4, pricelistId: 3 }); assert.equal(r.status, 200); const data = await r.json(); assert.ok(data.items.length); assert.ok(!("credit" in data.items[0])); assert.ok(!("total_invoiced" in data.items[0]));
    assert.equal((await request("customer-balances")).status, 403);
  });
  await check("customer writes enforce application permission", async () => {
    const before = writeCalls; assert.equal((await request("customers", "POST", { name: "Blocked" })).status, 403); assert.equal(writeCalls, before); permissions.push("customers.edit");
  });
  await check("customer create scopes company; foreign IDs cannot be edited or assigned", async () => {
    assert.equal((await request("customers", "POST", { name: "Fixture", category_id: [4], property_product_pricelist: 3 })).status, 201);
    const write = calls.findLast((call) => call.method === "create"); assert.equal(write.args[0].company_id, 41);
    const before = writeCalls;
    assert.equal((await request("customers/[id]", "PATCH", { name: "Foreign" }, "", 999)).status, 404);
    assert.equal((await request("customers", "POST", { name: "Wrong price", property_product_pricelist: 99 })).status, 403);
    assert.equal((await request("customers", "POST", { name: "Wrong group", category_id: [99] })).status, 403); assert.equal(writeCalls, before);
  });
  permissions = ["customers.view", "customers.edit", "customers.groups", "customers.balances", "customers.gift_cards", "customers.pricelists", "sell.checkout"];
  await check("assigned group cannot be deleted; unassigned deletion is scoped", async () => {
    const before = writeCalls; assert.equal((await request("customer-groups/[id]", "DELETE", null, "", 4)).status, 409); assert.equal(writeCalls, before);
    usedGroups = 0; assert.equal((await request("customer-groups/[id]", "DELETE", null, "", 4)).status, 200);
  });
  await check("gift card filtering excludes points before pagination and returns currency", async () => {
    const r = await request("gift-cards", "GET", null, "?limit=1"); assert.equal(r.status, 200); const data = await r.json(); assert.equal(data.items.length, 1); assert.equal(data.items[0].code, "GIFT"); assert.equal(data.hasNext, false); assert.equal(data.items[0].currency, "AUD"); assert.equal(data.items[0].status, "expired");
  });
  await check("missing gift module differs from denied access and transport failure", async () => {
    loyalty = "missing"; const missing = await request("gift-cards"); assert.equal(missing.status, 200); assert.equal((await missing.json()).available, false);
    loyalty = "denied"; assert.equal((await request("gift-cards")).status, 403);
    loyalty = "offline"; assert.equal((await request("gift-cards")).status, 502); loyalty = "ready";
  });
  await check("second-company binding cannot expand the Odoo session", async () => {
    foreign = true; for (const route of ["customer-balances", "gift-cards", "pricelists"]) assert.equal((await request(route)).status, 403); foreign = false;
  });
  const cart = { configId: 2, paymentMethodId: 1, customerId: 1, lines: [{ productId: 10, quantity: 1 }, { productId: 10, quantity: 1, uomFactor: 12 }] };
  let quote;
  await check("member wholesale quote aggregates bottle+case and includes tax/source", async () => {
    const r = await request("checkout/quote", "POST", cart); assert.equal(r.status, 200); quote = await r.json(); assert.equal(quote.total, 104); assert.equal(quote.lines[0].unitPrice, 8); assert.equal(quote.lines[1].total, 96); assert.equal(quote.priceSource, "Members"); assert.equal(quote.signature.length, 64);
  });
  await check("checkout matches quote and preserves cash rounding", async () => {
    const r = await request("checkout", "POST", { ...cart, expectedQuote: quote.signature, orderUuid: "12345678-1234-4234-8234-123456789abc", tendered: quote.total }); assert.equal(r.status, 201, JSON.stringify(await r.clone().json())); assert.equal(appliedOrder.amount_total, quote.total); assert.equal(appliedOrder.amount_tax, quote.tax); assert.equal(appliedOrder.lines[1][2].qty, 12); assert.equal(appliedOrder.lines[0][2].price_unit, 8);
  });
  await check("changed price blocks checkout before any order write", async () => {
    price = 8.13; const before = writeCalls; const r = await request("checkout", "POST", { ...cart, expectedQuote: quote.signature, orderUuid: "12345678-1234-4234-8234-123456789abd", tendered: 200 }); assert.equal(r.status, 409); assert.equal((await r.json()).code, "QUOTE_CHANGED"); assert.equal(writeCalls, before); price = 8;
  });
  await check("pricing bridge missing fails closed with actionable message", async () => {
    bridge = false; const r = await request("checkout/quote", "POST", cart); assert.equal(r.status, 409); assert.match((await r.json()).message, /Upgrade Orithos/); bridge = true;
  });
  await check("cash rounds nonexact cents while card preserves exact quote and checkout", async () => {
    price = 8.01;
    for (const useCash of [true, false]) {
      cash = useCash;
      const r = await request("checkout/quote", "POST", cart); assert.equal(r.status, 200);
      const current = await r.json(); assert.equal(current.unroundedTotal, 104.13); assert.equal(current.total, useCash ? 104.15 : 104.13);
      const sale = await request("checkout", "POST", { ...cart, expectedQuote: current.signature, orderUuid: useCash ? "12345678-1234-4234-8234-123456789ab1" : "12345678-1234-4234-8234-123456789ab2", tendered: current.total, externalPaymentConfirmed: true });
      assert.equal(sale.status, 201, JSON.stringify(await sale.clone().json())); assert.equal(appliedOrder.amount_total, current.total); assert.equal(appliedOrder.amount_tax, current.tax);
    }
    cash = true; price = 8;
  });
  await check("guest uses register price list and rejects incomplete engine response", async () => {
    const guest = { ...cart, customerId: null };
    assert.equal((await request("checkout/quote", "POST", guest)).status, 200);
    assert.equal(calls.findLast((call) => call.method === "orithos_quote_prices").args[2], false);
    invalidPrices = true; assert.equal((await request("checkout/quote", "POST", cart)).status, 502); invalidPrices = false;
  });
  await check("gift expiry is inclusive through store date and unconfigured differs from missing", async () => {
    giftDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const today = await (await request("gift-cards")).json(); assert.equal(today.items[0].status, "active");
    configuredPlans = false; const none = await (await request("gift-cards")).json(); assert.equal(none.available, true); assert.equal(none.state, "unconfigured");
    configuredPlans = true;
  });
  await check("refund keeps original transaction price without calling the current engine", async () => {
    const refund = { configId: 2, paymentMethodId: 1, customerId: 1, refundOfOrderId: 777, lines: [{ productId: 10, quantity: -1, refundedOrderLineId: 123 }], orderUuid: "12345678-1234-4234-8234-123456789ab3", tendered: 10 };
    assert.equal((await request("checkout", "POST", refund)).status, 403);
    permissions.push("sell.refund"); bridge = false;
    const result = await request("checkout", "POST", refund); assert.equal(result.status, 201, JSON.stringify(await result.clone().json()));
    assert.equal(appliedOrder.lines[0][2].price_unit, 10); assert.equal(appliedOrder.amount_total, -10); bridge = true;
    permissions = ["sell.refund"]; assert.equal((await request("checkout", "POST", { ...cart, tendered: 104, orderUuid: "12345678-1234-4234-8234-123456789ab4" })).status, 403);
  });
  fs.writeFileSync(path.join(root, "docs/UAT_CUSTOMER_OPTIMIZATION_ROUTE_2026-10-25.json"), JSON.stringify({ scope: "Actual Next route handlers with in-memory transport; not live Odoo acceptance", liveBusinessWrites: 0, simulatedWrites: writeCalls, checks }, null, 2));
  console.log(`${checks.length}/${checks.length} PASS`);
} finally { globalThis.fetch = originalFetch; if (originalBase === undefined) delete process.env.ODOO_BASE_URL; else process.env.ODOO_BASE_URL = originalBase; }
