import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = process.env.ORITHOS_ENV_FILE || path.resolve(root, "..", "..", ".env");
const env = Object.fromEntries(fs.readFileSync(envPath, "utf8").split(/\r?\n/)
  .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
  .map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
  }));

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const days = Number(arg("--days", "365"));
const limit = Number(arg("--limit", "500"));
const companyId = Number(arg("--company-id", "5"));
const output = arg("--out", path.resolve(root, "data/ai-eval/odoo-sales-snapshot-365d.json"));
if (!Number.isInteger(days) || days < 28 || !Number.isInteger(limit) || limit < 1) {
  throw new Error("--days must be >= 28 and --limit must be positive");
}

const base = env.ODOO_BASE_URL || "https://odoo.orithos.com.au";
const database = env.ODOO_DATABASE_UAT || "aipos_uat";
const cookie = { value: "" };
async function post(route, body) {
  const response = await fetch(`${base}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie.value ? { cookie: cookie.value } : {}) },
    body: JSON.stringify(body),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie.value = setCookie.split(";")[0];
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.data?.message || payload.error.message || "Odoo RPC error");
  return payload.result;
}
async function rpc(model, method, args = [], kwargs = {}) {
  return post(`/web/dataset/call_kw/${model}/${method}`, {
    jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs },
  });
}
async function chunked(ids, size, callback) {
  const results = [];
  for (let index = 0; index < ids.length; index += size) results.push(...await callback(ids.slice(index, index + size)));
  return results;
}

await post("/web/session/authenticate", {
  jsonrpc: "2.0", method: "call", params: { db: database, login: env.ODOO_USER, password: env.ODOO_PASS },
});
const latest = await rpc("pos.order", "search_read", [[
  ["company_id", "=", companyId], ["state", "in", ["paid", "done", "invoiced"]],
], ["date_order"]], { order: "date_order desc", limit: 1 });
if (!latest.length) throw new Error("No completed POS orders found for company");
const endDate = latest[0].date_order.slice(0, 10);
const end = new Date(`${endDate}T00:00:00Z`);
const start = new Date(end.getTime() - (days - 1) * 86400000);
const startDate = start.toISOString().slice(0, 10);
const afterDate = new Date(end.getTime() + 86400000).toISOString().slice(0, 10);
const orderDomain = [
  ["company_id", "=", companyId], ["state", "in", ["paid", "done", "invoiced"]],
  ["date_order", ">=", startDate], ["date_order", "<", afterDate],
];
const lineDomain = [["order_id.date_order", ">=", startDate], ["order_id.date_order", "<", afterDate],
  ["order_id.company_id", "=", companyId], ["order_id.state", "in", ["paid", "done", "invoiced"]]];

const grouped = await rpc("pos.order.line", "read_group", [lineDomain,
  ["qty:sum", "price_subtotal:sum", "product_id"], ["product_id"]], { lazy: false, limit: 0 });
const ranked = grouped.filter((row) => row.product_id?.[0]).sort((a, b) => (b.qty || 0) - (a.qty || 0)).slice(0, limit);
const productIds = ranked.map((row) => row.product_id[0]);
const lines = await chunked(productIds, 100, async (ids) => {
  const rows = [];
  for (let offset = 0; ; offset += 5000) {
    const page = await rpc("pos.order.line", "search_read",
      [[...lineDomain, ["product_id", "in", ids]],
       ["product_id", "qty", "price_subtotal", "order_id"]],
      { order: "id asc", offset, limit: 5000 });
    rows.push(...page);
    if (page.length < 5000) break;
  }
  return rows;
});
const orderIds = [...new Set(lines.map((line) => line.order_id?.[0]).filter(Boolean))];
const orders = await chunked(orderIds, 1000, (ids) => rpc("pos.order", "read", [ids, ["date_order"]]));
const orderDate = new Map(orders.map((order) => [order.id, order.date_order.slice(0, 10)]));
const dates = [];
for (let cursor = new Date(start); cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) dates.push(cursor.toISOString().slice(0, 10));
const products = new Map(productIds.map((id) => [id, { units: new Map(), revenue: new Map() }]));
for (const line of lines) {
  const date = orderDate.get(line.order_id?.[0]);
  const product = products.get(line.product_id?.[0]);
  if (!date || !product) continue;
  product.units.set(date, (product.units.get(date) || 0) + Number(line.qty || 0));
  product.revenue.set(date, (product.revenue.get(date) || 0) + Number(line.price_subtotal || 0));
}
const metadata = await chunked(productIds, 1000, (ids) => rpc("product.product", "read", [ids,
  ["name", "default_code", "standard_price", "list_price"]]));
const meta = new Map(metadata.map((row) => [row.id, row]));
const series = productIds.map((productId) => {
  const row = products.get(productId); const info = meta.get(productId) || {};
  const unitCost = Number(info.standard_price || 0); const unitPrice = Number(info.list_price || 0);
  return {
    productId, productName: info.name || null, sku: info.default_code || null,
    unitCost: unitCost > 0 ? unitCost : null, unitPrice: unitPrice > 0 ? unitPrice : null,
    dates, units: dates.map((date) => Number((row.units.get(date) || 0).toFixed(4))),
    revenue: dates.map((date) => Number((row.revenue.get(date) || 0).toFixed(2))),
    stockoutFlags: [], stockoutDataQuality: "AWAITING_READ_ONLY_MOVE_HISTORY",
  };
});
const report = {
  snapshotVersion: `odoo-readonly-sales-${days}d-${endDate}`,
  source: "odoo-jsonrpc-pos-order-lines-read-only",
  companyId, generatedAt: new Date().toISOString(), startDate, endDate,
  historyDays: days, topProductsRequested: limit, productsReturned: series.length,
  ordersInRange: await rpc("pos.order", "search_count", [orderDomain]), orderLinesRead: lines.length,
  writeRequests: [], series,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output, startDate, endDate, historyDays: days, productsReturned: series.length,
  ordersInRange: report.ordersInRange, orderLinesRead: lines.length, writeRequests: [] }));
