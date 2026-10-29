import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { request } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
const envText = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
const env = Object.fromEntries(envText.split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
const base = (process.env.PILOT_BASE_URL ?? "https://skr.orithos.com.au").replace(/\/+$/, "");
const username = process.env.PILOT_USERNAME ?? env.PILOT_USERNAME ?? "shawn";
const password = process.env.PILOT_PASSWORD ?? env.PILOT_PASSWORD;
const requireGst = process.env.PILOT_REQUIRE_GST === "true";
const allowNegativeStock = process.env.PILOT_ALLOW_NEGATIVE_STOCK === "true";
const productQuery = process.env.PILOT_PRODUCT_QUERY;
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_SELL_REFUND_API_SKR_2026-10-29.json");
const checks = [];
const record = (name, ok, detail = null) => checks.push({ name, status: ok ? "PASS" : "FAIL", ...(detail === null ? {} : { detail }) });
const headers = { Origin: base };
let client;

async function call(method, pathname, data) {
  const response = await client.fetch(`${base}${pathname}`, { method, data, headers, timeout: 60000 });
  return { response, body: await response.json().catch(() => ({})) };
}

try {
  client = await request.newContext();
  if (!password) throw new Error("MISSING_PILOT_PASSWORD");
  let login = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    login = await call("POST", "/api/auth/login", { username, password });
    if (login.response.ok() && login.body.code === 0) break;
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  record("login", Boolean(login?.response.ok() && login.body.code === 0), login?.response.status());
  if (!login?.response.ok() || login.body.code !== 0) throw new Error("LOGIN_FAILED");
  const session = await call("GET", "/api/odoo/session");
  record("Odoo session warmup", session.response.ok() && Boolean(session.body.user), session.response.status());
  const bootstrap = await call("GET", "/api/odoo/pos-bootstrap");
  const config = (bootstrap.body.configs ?? []).find((item) => item.session) ?? bootstrap.body.configs?.[0];
  const cash = config?.paymentMethods?.find((item) => item.is_cash_count) ?? config?.paymentMethods?.[0];
  record("open register and cash method", bootstrap.response.ok() && Number.isSafeInteger(config?.id) && Number.isSafeInteger(cash?.id) && Boolean(config?.session), { configId: config?.id, sessionId: config?.session?.id, paymentMethodId: cash?.id });
  if (!config?.id || !cash?.id) throw new Error("NO_OPEN_REGISTER");

  const products = await call("POST", "/api/odoo/records", { type: "products", limit: 100, ...(productQuery ? { query: productQuery } : {}) });
  const product = (products.body.items ?? []).find((item) => item.available_in_pos !== false && Number(item.price_included ?? item.list_price ?? 0) > 0 && Number(item.price_included ?? item.list_price ?? 0) < 40 && (allowNegativeStock || Number(item.free_qty ?? item.qty_available ?? 0) > 0) && (!requireGst || (Array.isArray(item.taxes_id) && item.taxes_id.length > 0)));
  const beforeQty = Number(product?.free_qty ?? product?.qty_available ?? 0);
  record("find sellable stocked product", products.response.ok() && Number.isSafeInteger(product?.id) && (allowNegativeStock ? Number.isFinite(beforeQty) : beforeQty > 0), { productId: product?.id, beforeQty, requireGst, allowNegativeStock, productQuery: productQuery ?? null });
  if (!product?.id) throw new Error("NO_SELLABLE_PRODUCT");

  const lines = [{ productId: product.id, quantity: 1 }];
  const quote = await call("POST", "/api/odoo/checkout/quote", { configId: config.id, paymentMethodId: cash.id, lines });
  const total = Number(quote.body.total);
  record("quote returns total and signature", quote.response.ok() && Number.isFinite(total) && total > 0 && typeof quote.body.signature === "string" && (!requireGst || Number(quote.body.tax) > 0), { status: quote.response.status(), total, tax: quote.body.tax, requireGst });
  if (!quote.body.signature) throw new Error("QUOTE_FAILED");

  const sale = await call("POST", "/api/odoo/checkout", { configId: config.id, paymentMethodId: cash.id, orderUuid: randomUUID(), tendered: total, expectedQuote: quote.body.signature, lines });
  record("cash sale is confirmed", sale.response.status() === 201 && sale.body.isRefund === false && Number.isSafeInteger(sale.body.saleId) && (!requireGst || Number(sale.body.gst) > 0), { status: sale.response.status(), saleId: sale.body.saleId, receipt: sale.body.receipt, total: sale.body.total, gst: sale.body.gst, requireGst });
  if (!sale.body.saleId) throw new Error("SALE_FAILED");

  const detail = await call("GET", `/api/odoo/sales/${sale.body.saleId}`);
  const sourceLine = detail.body.lines?.find((line) => line.qty > 0);
  record("sale detail exposes refundable line", detail.response.ok() && Number.isSafeInteger(sourceLine?.id) && sourceLine.refunded_qty === 0, { status: detail.response.status(), lineId: sourceLine?.id });
  if (!sourceLine?.id) throw new Error("SALE_DETAIL_FAILED");

  const refund = await call("POST", "/api/odoo/checkout", { configId: config.id, paymentMethodId: cash.id, orderUuid: randomUUID(), tendered: total, refundOfOrderId: sale.body.saleId, lines: [{ productId: product.id, quantity: -1, refundedOrderLineId: sourceLine.id }] });
  record("full cash refund is confirmed", refund.response.status() === 201 && refund.body.isRefund === true && Number(refund.body.total) === total && (!requireGst || Number(refund.body.gst) > 0), { status: refund.response.status(), refundId: refund.body.saleId, receipt: refund.body.receipt, total: refund.body.total, gst: refund.body.gst, requireGst });

  const afterProducts = await call("POST", "/api/odoo/records", { type: "products", query: String(product.barcode || product.default_code || product.name).slice(0, 120), limit: 100 });
  const after = (afterProducts.body.items ?? []).find((item) => item.id === product.id);
  const afterQty = Number(after?.free_qty ?? after?.qty_available ?? NaN);
  record("inventory returns to pre-sale quantity after refund", afterProducts.response.ok() && Number.isFinite(afterQty) && Math.abs(afterQty - beforeQty) < 0.001, { beforeQty, afterQty });

  const saleHistory = await call("POST", "/api/odoo/records", { type: "sales", query: String(sale.body.receipt ?? ""), limit: 20 });
  const refundHistory = await call("POST", "/api/odoo/records", { type: "sales", query: String(refund.body.receipt ?? ""), limit: 20 });
  const rows = [...(saleHistory.body.items ?? []), ...(refundHistory.body.items ?? [])];
  record("history contains sale and refund pair", saleHistory.response.ok() && refundHistory.response.ok() && rows.some((row) => row.id === sale.body.saleId && row.amount_total > 0) && rows.some((row) => row.id === refund.body.saleId && row.amount_total < 0), { saleStatus: saleHistory.response.status(), refundStatus: refundHistory.response.status(), rows: rows.length });
} catch (error) {
  record("run", false, error instanceof Error ? error.message : String(error));
} finally {
  await client?.post(`${base}/api/auth/logout`, { headers }).catch(() => null);
  await client?.dispose();
}

const allPassed = checks.every((check) => check.status === "PASS");
const blocked = requireGst && checks.some((check) => check.name === "find sellable stocked product" && check.status === "FAIL");
const output = { generatedAt: new Date().toISOString(), target: base, username, scope: "Odoo POS API cash sale -> full refund -> inventory and history reconciliation", status: allPassed ? "PASS" : blocked ? "BLOCKED" : "FAIL", checks };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, passed: checks.filter((check) => check.status === "PASS").length }));
if (output.status !== "PASS") process.exitCode = output.status === "BLOCKED" ? 2 : 1;
