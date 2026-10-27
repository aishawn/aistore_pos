import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const root = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:"));
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
const base = (process.env.PILOT_BASE_URL || "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD;
const runtime = process.env.PILOT_DEPLOYMENT_SHA || null;
const evidence = { generatedAt: new Date().toISOString(), base, runtime, databasePolicy: "aipos_uat shared UAT", checks: [] };
const record = (name, passed, detail = {}) => { const status = passed === "BLOCKED" ? "BLOCKED" : passed ? "PASS" : "FAIL"; evidence.checks.push({ name, status, ...detail }); console.log(`[${status}] ${name}`, detail); };
const json = async (res) => { const text = await res.text(); try { return JSON.parse(text); } catch { return { raw: text.slice(0, 300) }; } };

if (!password) throw new Error("INITIAL_ADMIN_PASSWORD missing");
const cookieJar = (res) => (res.headers.getSetCookie?.() || []).map((value) => value.split(";")[0]).join("; ");
const request = async (url, options = {}) => fetch(`${base}${url}`, { ...options, headers: { Origin: base, ...(options.headers || {}) } });

let res = await request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password }) });
let body = await json(res); let cookies = cookieJar(res); const token = body.data?.accessToken;
record("login", res.ok && body.code === 0, { httpStatus: res.status });
const auth = () => ({ Cookie: cookies, Authorization: `Bearer ${token}` });
res = await request("/api/odoo/session", { headers: auth() }); body = await json(res); cookies = [cookies, cookieJar(res)].filter(Boolean).join("; ");
record("odoo.session", res.ok && Boolean(body.user), { httpStatus: res.status, user: body.user?.username });
res = await request("/api/odoo/pos-bootstrap", { headers: auth() }); body = await json(res);
const configs = body.configs || []; const config = configs.find((item) => item.session || item.currentSessionId || item.current_session_id) || configs[0];
const configId = config?.id; const methods = config?.paymentMethods || []; const payment = methods.find((item) => item.is_cash_count) || methods[0];
record("pos.bootstrap", res.ok && Number.isInteger(configId) && Boolean(payment?.id), { httpStatus: res.status, configId, paymentMethodId: payment?.id, session: config?.session?.name || config?.session });
if (!configId || !payment?.id) throw new Error("No open POS config/payment method");
res = await request("/api/odoo/records", { method: "POST", headers: { ...auth(), "Content-Type": "application/json" }, body: JSON.stringify({ type: "products", limit: 100 }) }); body = await json(res);
const product = (body.items || []).find((item) => item.available_in_pos !== false && Number(item.free_qty ?? item.qty_available ?? 0) > 0 && Number(item.price_included ?? item.lst_price ?? item.list_price ?? 0) > 0);
const beforeQty = Number(product?.free_qty ?? product?.qty_available ?? 0);
record("product.with-stock", Boolean(product), { productId: product?.id, name: product?.name, beforeQty });
if (!product) throw new Error("No in-stock POS product");

const lines = [{ productId: product.id, quantity: 1 }]; const orderUuid = randomUUID();
res = await request("/api/odoo/checkout/quote", { method: "POST", headers: { ...auth(), "Content-Type": "application/json" }, body: JSON.stringify({ configId, paymentMethodId: payment.id, lines }) });
const quote = await json(res); const total = Number(quote.total); const gst = Number(quote.tax ?? quote.gst ?? quote.amountTax ?? 0);
record("sale.quote", res.ok && Number.isFinite(total) && total > 0, { httpStatus: res.status, total, gst });
const checkoutBody = { configId, paymentMethodId: payment.id, orderUuid, expectedQuote: quote.signature, tendered: total, lines, ...(payment.is_cash_count ? {} : { externalPaymentConfirmed: true }) };
res = await request("/api/odoo/checkout", { method: "POST", headers: { ...auth(), "Content-Type": "application/json" }, body: JSON.stringify(checkoutBody) });
const sale = await json(res); const saleId = sale.saleId; const saleLines = sale.lines || [];
record("sale.create", res.status === 201 && Number.isInteger(saleId), { httpStatus: res.status, saleId, receipt: sale.receipt, total: sale.total, gst: sale.gst, lines: saleLines.length });
if (!saleId) throw new Error(`Sale failed: ${JSON.stringify(sale).slice(0, 400)}`);
res = await request("/api/odoo/checkout", { method: "POST", headers: { ...auth(), "Content-Type": "application/json" }, body: JSON.stringify(checkoutBody) });
const retry = await json(res); record("sale.retry.idempotent", res.status === 200 && retry.saleId === saleId, { httpStatus: res.status, saleId: retry.saleId });
res = await request(`/api/odoo/sales/${saleId}`, { headers: auth() }); const readback = await json(res); const readbackOrder = readback.order || readback; record("sale.readback", res.ok && Number(readbackOrder.amount_total) === Number(sale.total) && Number(readbackOrder.amount_tax) === Number(sale.gst), { httpStatus: res.status, state: readbackOrder.state, total: readbackOrder.amount_total, gst: readbackOrder.amount_tax });

res = await request(`/api/odoo/sales/${saleId}`, { headers: auth() }); const saleDetail = await json(res);
const refundLine = saleDetail.lines?.find((line) => Number(Array.isArray(line.product_id) ? line.product_id[0] : line.product_id) === product.id) || saleLines[0] || { productId: product.id, refundedOrderLineId: sale.orderLineId || sale.lineId || null };
const refundedOrderLineId = Number(refundLine.id || refundLine.refundedOrderLineId || 0) || null;
if (!refundedOrderLineId) { record("refund", "BLOCKED", { message: "Sale detail did not expose order line id; no refund write attempted." }); }
else {
  const refundBody = { configId, paymentMethodId: payment.id, orderUuid: randomUUID(), refundOfOrderId: saleId, tendered: total, lines: [{ productId: product.id, quantity: -1, refundedOrderLineId }], ...(payment.is_cash_count ? {} : { externalPaymentConfirmed: true }) };
  res = await request("/api/odoo/checkout", { method: "POST", headers: { ...auth(), "Content-Type": "application/json" }, body: JSON.stringify(refundBody) }); const refund = await json(res);
  record("refund.create", res.status === 201 && Number.isInteger(refund.saleId), { httpStatus: res.status, refundId: refund.saleId, total: refund.total, gst: refund.gst });
}
res = await request("/api/odoo/records", { method: "POST", headers: { ...auth(), "Content-Type": "application/json" }, body: JSON.stringify({ type: "products", limit: 100 }) }); body = await json(res); const after = (body.items || []).find((item) => item.id === product.id); const afterQty = Number(after?.free_qty ?? after?.qty_available ?? beforeQty);
record("stock.restored", afterQty === beforeQty, { beforeQty, afterQty });
evidence.status = evidence.checks.every((check) => check.status === "PASS");
const out = process.env.PILOT_UAT_OUTPUT_PATH ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH) : path.join(root, "docs", `UAT_SALES_REFUND_CURRENT_${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`); console.log(JSON.stringify({ out, status: evidence.status }));
if (!evidence.status) process.exitCode = 1;
