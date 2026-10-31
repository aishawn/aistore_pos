import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const base = (process.env.SKR_BASE_URL || "https://skr.orithos.com.au").replace(/\/+$/, "");
const username = process.env.SKR_USERNAME || "shawn";
const password = process.env.SKR_PASSWORD;
const inputPath = process.env.SKR_FORECAST_REPAIR_INPUT || ".local/skr-forecast-snapshot-live-180d-20261031.json";
const outputPath = process.env.SKR_FORECAST_REPAIR_OUTPUT || ".local/skr-forecast-snapshot-live-180d-repaired-20261031.json";
const concurrency = Math.max(1, Math.min(6, Number.parseInt(process.env.SKR_FORECAST_REPAIR_CONCURRENCY || "4", 10)));
const timeoutMs = Math.max(5000, Math.min(60000, Number.parseInt(process.env.SKR_FORECAST_REQUEST_TIMEOUT_MS || "20000", 10)));
const maxAttempts = Math.max(1, Math.min(6, Number.parseInt(process.env.SKR_FORECAST_MAX_ATTEMPTS || "4", 10)));
const pageSize = 100;

if (!password) throw new Error("SKR_PASSWORD is required");
if (!fs.existsSync(inputPath)) throw new Error(`snapshot not found: ${inputPath}`);
const snapshot = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const failedIds = new Set(snapshot.fetchDiagnostics.details
  .filter((item) => item.status < 200 || item.status >= 300)
  .map((item) => Number(item.orderId)));
if (!failedIds.size) throw new Error("snapshot contains no failed detail requests");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ extraHTTPHeaders: { Origin: base } });
const login = await context.request.post(`${base}/api/auth/login`, {
  data: { username, password }, headers: { Origin: base },
});
const loginBody = await login.json().catch(() => ({}));
if (!login.ok() || loginBody.code !== 0) throw new Error(`SKR_LOGIN_FAILED_${login.status()}`);
const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
const page = await context.newPage();
if (accessCookie) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem("sf_token", token);
    localStorage.setItem("sf_user", JSON.stringify(user));
  }, { token: accessCookie.value, user: loginBody.data.user });
}
await page.goto(`${base}/overview`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(1000);

async function evaluateRequest(source, argument) {
  return page.evaluate(async ({ source, argument }) => {
    const token = localStorage.getItem("sf_token");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), argument.timeoutMs);
    try {
      const response = source === "sales"
        ? await fetch("/api/odoo/records", {
          method: "POST",
          headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
          credentials: "include",
          body: JSON.stringify(argument.body),
          signal: controller.signal,
        })
        : await fetch(`/api/odoo/sales/${argument.id}`, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
          credentials: "include",
          signal: controller.signal,
        });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    } finally {
      clearTimeout(timer);
    }
  }, { source, argument: { ...argument, timeoutMs } });
}

async function refreshOdooSession() {
  return page.evaluate(async () => {
    const token = localStorage.getItem("sf_token");
    const response = await fetch("/api/odoo/session", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      credentials: "include",
    });
    return response.status;
  });
}

async function ordersForFailedIds() {
  const matches = new Map();
  let offset = 0;
  let hasNext = true;
  while (hasNext) {
    const response = await evaluateRequest("sales", {
      timeoutMs,
      body: { type: "sales", limit: pageSize, offset, period: snapshot.period, status: "completed" },
    });
    if (response.status === 401) {
      await refreshOdooSession();
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`SKR_SALES_FAILED_${response.status}`);
    const rows = Array.isArray(response.body?.items) ? response.body.items : [];
    for (const order of rows) if (failedIds.has(Number(order.id))) matches.set(Number(order.id), order);
    hasNext = response.body?.hasNext === true;
    offset += rows.length;
    if (!rows.length) break;
  }
  return matches;
}

async function detail(id) {
  let result;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      result = await evaluateRequest("detail", { id, timeoutMs });
    } catch {
      result = { status: 599, body: {} };
    }
    if (result.status >= 200 && result.status < 300) return result;
    if (result.status === 401) await refreshOdooSession();
    if (attempt + 1 < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return result || { status: 599, body: {} };
}

const orders = await ordersForFailedIds();
const pending = [...failedIds].filter((id) => orders.has(id));
if (pending.length !== failedIds.size) {
  throw new Error(`FAILED_ORDER_LOOKUP_INCOMPLETE_${pending.length}_OF_${failedIds.size}`);
}

const daily = new Map(snapshot.salesDaily.map((row) => [`${row.productId}|${row.date}`, { ...row }]));
const repairedStatuses = new Map();
for (let index = 0; index < pending.length; index += concurrency) {
  const batch = pending.slice(index, index + concurrency);
  const results = await Promise.all(batch.map(async (id) => ({ id, order: orders.get(id), response: await detail(id) })));
  for (const { id, order, response } of results) {
    repairedStatuses.set(id, response.status);
    if (response.status < 200 || response.status >= 300) continue;
    const date = String(order.date_order || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    for (const line of Array.isArray(response.body?.lines) ? response.body.lines : []) {
      const product = Array.isArray(line.product_id) ? line.product_id : [];
      const productId = Number(product[0]);
      const units = Number(line.qty);
      if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(units)) continue;
      const key = `${productId}|${date}`;
      const row = daily.get(key) || { productId, date, units: 0, revenue: 0, orders: 0 };
      row.units += units;
      row.revenue += Number(line.price_subtotal_incl ?? line.price_subtotal ?? 0) || 0;
      row.orders += 1;
      daily.set(key, row);
    }
  }
  console.error(JSON.stringify({ phase: "repair_details", processed: Math.min(index + batch.length, pending.length), total: pending.length }));
}

const byProduct = new Map();
for (const row of daily.values()) {
  const dates = byProduct.get(row.productId) || new Map();
  dates.set(row.date, row);
  byProduct.set(row.productId, dates);
}
snapshot.salesDaily = [...daily.values()];
snapshot.series = [...byProduct.entries()].map(([productId, dates]) => {
  const ordered = [...dates.values()].sort((left, right) => left.date.localeCompare(right.date));
  return { productId, dates: ordered.map((row) => row.date), units: ordered.map((row) => Number(row.units.toFixed(4))), stockoutFlags: [] };
});
for (const item of snapshot.fetchDiagnostics.details) {
  const status = repairedStatuses.get(Number(item.orderId));
  if (status !== undefined) item.status = status;
}
const remainingFailures = snapshot.fetchDiagnostics.details.filter((item) => item.status < 200 || item.status >= 300).length;
snapshot.counts.productSeries = snapshot.series.length;
snapshot.counts.salesDaily = snapshot.salesDaily.length;
snapshot.counts.detailFailures = remainingFailures;
snapshot.dataQuality.status = remainingFailures ? "INCOMPLETE_DETAIL_FAILURES" : "SALES_ONLY";
snapshot.dataQuality.detailFailures = remainingFailures;
snapshot.dataQuality.orderPaginationComplete = true;
snapshot.dataQuality.orderLimitReached = false;
snapshot.dataQuality.zeroSalesDays = "UNAVAILABLE";
snapshot.fetchDiagnostics.repair = {
  attempted: failedIds.size,
  foundOrders: orders.size,
  repaired: [...repairedStatuses.values()].filter((status) => status >= 200 && status < 300).length,
  remainingFailures,
  detailConcurrency: concurrency,
  maxAttempts,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, repaired: snapshot.fetchDiagnostics.repair.repaired, remainingFailures,
  ordersFetched: snapshot.counts.ordersFetched, productSeries: snapshot.counts.productSeries,
  salesDaily: snapshot.counts.salesDaily, dataQuality: snapshot.dataQuality.status }, null, 2));
await browser.close();
