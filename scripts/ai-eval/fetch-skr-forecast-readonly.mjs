import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const base = (process.env.SKR_BASE_URL || "https://skr.orithos.com.au").replace(/\/+$/, "");
const username = process.env.SKR_USERNAME || "shawn";
const password = process.env.SKR_PASSWORD;
const productSnapshotPath = process.env.SKR_PRODUCT_SNAPSHOT || ".local/skr-snapshot-live-20261031.json";
const outputPath = process.env.SKR_FORECAST_SNAPSHOT_OUTPUT || ".local/skr-forecast-snapshot-live.json";
const period = process.env.SKR_SALES_PERIOD || "180d";
const maxOrders = Math.max(1, Number.parseInt(process.env.SKR_FORECAST_MAX_ORDERS || "5000", 10));
const maxInventoryMoves = Math.max(1, Number.parseInt(process.env.SKR_FORECAST_MAX_INVENTORY_MOVES || "100000", 10));
const detailConcurrency = Math.max(1, Math.min(12, Number.parseInt(process.env.SKR_FORECAST_DETAIL_CONCURRENCY || "6", 10)));
const requestTimeoutMs = Math.max(5000, Math.min(60000, Number.parseInt(process.env.SKR_FORECAST_REQUEST_TIMEOUT_MS || "20000", 10)));
const maxAttempts = Math.max(1, Math.min(4, Number.parseInt(process.env.SKR_FORECAST_MAX_ATTEMPTS || "3", 10)));
const pageSize = 100;

if (!password) throw new Error("SKR_PASSWORD is required");
if (!fs.existsSync(productSnapshotPath)) throw new Error(`product snapshot not found: ${productSnapshotPath}`);

const productsSnapshot = JSON.parse(fs.readFileSync(productSnapshotPath, "utf8"));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ extraHTTPHeaders: { Origin: base } });
const api = context.request;
const login = await api.post(`${base}/api/auth/login`, {
  data: { username, password },
  headers: { Origin: base },
});
const loginBody = await login.json().catch(() => ({}));
if (!login.ok() || loginBody.code !== 0) throw new Error(`SKR_LOGIN_FAILED_${login.status()}`);
const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
if (accessCookie) {
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("sf_token", token);
    localStorage.setItem("sf_user", JSON.stringify(user));
  }, { token: accessCookie.value, user: loginBody.data.user });
}
const page = await context.newPage();
await page.goto(`${base}/overview`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(1500);
const odooSession = await page.evaluate(async () => {
  const token = localStorage.getItem("sf_token");
  const response = await fetch("/api/odoo/session", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    credentials: "include",
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
});
if (odooSession.status < 200 || odooSession.status >= 300) {
  throw new Error(`SKR_ODOO_SESSION_FAILED_${odooSession.status}`);
}

async function records(payload) {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await page.evaluate(async ({ body, timeoutMs }) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const token = localStorage.getItem("sf_token");
          const response = await fetch("/api/odoo/records", {
            method: "POST",
            headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
            credentials: "include",
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          return { status: response.status, body: await response.json().catch(() => ({})) };
        } finally {
          clearTimeout(timer);
        }
      }, { body: payload, timeoutMs: requestTimeoutMs });
    } catch (error) {
      lastError = error;
      if (attempt + 1 < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError || new Error("SKR records request failed");
}

async function inventoryHistory(payload) {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await page.evaluate(async ({ query, timeoutMs }) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const token = localStorage.getItem("sf_token");
          const params = new URLSearchParams(query);
          const response = await fetch(`/api/odoo/inventory-history?${params.toString()}`, {
            headers: token ? { authorization: `Bearer ${token}` } : {},
            credentials: "include",
            signal: controller.signal,
          });
          return { status: response.status, body: await response.json().catch(() => ({})) };
        } finally {
          clearTimeout(timer);
        }
      }, { query: payload, timeoutMs: requestTimeoutMs });
    } catch (error) {
      lastError = error;
      if (attempt + 1 < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError || new Error("SKR inventory history request failed");
}

async function saleDetail(id) {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await page.evaluate(async ({ saleId, timeoutMs }) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const token = localStorage.getItem("sf_token");
          const response = await fetch(`/api/odoo/sales/${saleId}`, {
            headers: token ? { authorization: `Bearer ${token}` } : {},
            credentials: "include",
            signal: controller.signal,
          });
          return { status: response.status, body: await response.json().catch(() => ({})) };
        } finally {
          clearTimeout(timer);
        }
      }, { saleId: id, timeoutMs: requestTimeoutMs });
      if (result.status === 401 && attempt + 1 < maxAttempts) {
        await page.evaluate(async () => {
          const token = localStorage.getItem("sf_token");
          await fetch("/api/odoo/session", {
            headers: token ? { authorization: `Bearer ${token}` } : {},
            credentials: "include",
          });
        });
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      if ([502, 503, 504, 599].includes(result.status) && attempt + 1 < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  return { status: 599, body: {}, error: lastError?.message || "request failed" };
}

const orders = [];
let offset = 0;
let hasNext = true;
const diagnostics = [];
while (hasNext && orders.length < maxOrders) {
  const result = await records({ type: "sales", limit: pageSize, offset, period, status: "completed" });
  const items = Array.isArray(result.body?.items) ? result.body.items : [];
  diagnostics.push({ type: "sales", offset, status: result.status, itemCount: items.length });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`SKR_SALES_FAILED_${result.status}`);
  }
  orders.push(...items.slice(0, maxOrders - orders.length));
  hasNext = result.body?.hasNext === true;
  offset += items.length;
  if (!items.length) break;
}

const daily = new Map();
const detailDiagnostics = [];
for (let index = 0; index < orders.length; index += detailConcurrency) {
  const batch = orders.slice(index, index + detailConcurrency);
  const details = await Promise.all(batch.map(async (order) => ({ order, detail: await saleDetail(order.id) })));
  for (const { order, detail } of details) {
    detailDiagnostics.push({ orderId: order.id, status: detail.status });
    if (detail.status < 200 || detail.status >= 300) continue;
    const lines = Array.isArray(detail.body?.lines) ? detail.body.lines : [];
    const date = String(order.date_order || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    for (const line of lines) {
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
  if ((index + batch.length) % 120 === 0 || index + batch.length === orders.length) {
    console.error(JSON.stringify({ phase: "sales_details", processed: index + batch.length, total: orders.length }));
  }
}

const periodDays = Math.max(1, Number.parseInt(period, 10) || 180);
const inventoryFrom = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
const inventoryTo = new Date();
const inventoryMoves = [];
const inventoryDiagnostics = [];
let inventoryOffset = 0;
let inventoryHasNext = true;
let inventoryHistoryComplete = true;
while (inventoryHasNext && inventoryMoves.length < maxInventoryMoves) {
  const result = await inventoryHistory({
    from: inventoryFrom.toISOString(),
    to: inventoryTo.toISOString(),
    limit: "1000",
    offset: String(inventoryOffset),
  });
  const items = Array.isArray(result.body?.items) ? result.body.items : [];
  inventoryDiagnostics.push({ offset: inventoryOffset, status: result.status, itemCount: items.length });
  if (result.status < 200 || result.status >= 300) {
    inventoryHistoryComplete = false;
    break;
  }
  inventoryMoves.push(...items.slice(0, maxInventoryMoves - inventoryMoves.length));
  inventoryHasNext = result.body?.hasNext === true;
  inventoryOffset += items.length;
  if (!items.length) break;
}
if (inventoryHasNext) inventoryHistoryComplete = false;

const byProduct = new Map();
for (const row of daily.values()) {
  const series = byProduct.get(row.productId) || new Map();
  series.set(row.date, row);
  byProduct.set(row.productId, series);
}
const series = [...byProduct.entries()].map(([productId, dates]) => {
  const ordered = [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    productId,
    dates: ordered.map((row) => row.date),
    units: ordered.map((row) => Number(row.units.toFixed(4))),
    stockoutFlags: [],
  };
}).filter((item) => item.dates.length > 0);

const sourceVersion = `skr-sales-${new Date().toISOString()}`;
const snapshot = {
  schemaVersion: 1,
  source: "skr-readonly-api-sales-lines-and-stock-moves",
  sourceBase: base,
  sourceVersion,
  generatedAt: new Date().toISOString(),
  period,
  currency: productsSnapshot.currency || "AUD",
  timezone: productsSnapshot.timezone || "Australia/Adelaide",
  vendorId: productsSnapshot.vendorId ?? null,
  outletId: productsSnapshot.outletId ?? null,
  series,
  salesDaily: [...daily.values()],
  inventoryMoves,
  inventoryCurrent: Array.isArray(productsSnapshot.products) ? productsSnapshot.products.map((product) => ({
    productId: product.id,
    stock: product.stock,
    freeStock: product.freeStock,
    stockUpdatedAt: product.stockUpdatedAt,
  })) : [],
  dataQuality: {
    status: detailDiagnostics.some((item) => item.status < 200 || item.status >= 300)
      ? "INCOMPLETE_DETAIL_FAILURES"
      : (hasNext ? "INCOMPLETE_ORDER_CAP" : inventoryHistoryComplete ? "SALES_AND_INVENTORY_MOVES" : "INCOMPLETE_INVENTORY_HISTORY"),
    orderPaginationComplete: !hasNext,
    orderLimitReached: orders.length >= maxOrders,
    detailFailures: detailDiagnostics.filter((item) => item.status < 200 || item.status >= 300).length,
    zeroSalesDays: "UNAVAILABLE",
    stockoutHistory: "UNAVAILABLE",
    inventoryHistory: inventoryHistoryComplete ? "AVAILABLE" : "INCOMPLETE",
    inventoryHistoryMoveCount: inventoryMoves.length,
    inventoryHistoryFrom: inventoryFrom.toISOString(),
    inventoryHistoryTo: inventoryTo.toISOString(),
    suppliers: "NOT_FETCHED",
    promotions: "NOT_FETCHED",
    detailConcurrency,
    requestTimeoutMs,
    maxAttempts,
  },
  counts: {
    ordersFetched: orders.length,
    productSeries: series.length,
    salesDaily: daily.size,
    detailFailures: detailDiagnostics.filter((item) => item.status < 200 || item.status >= 300).length,
    inventoryMoves: inventoryMoves.length,
  },
  fetchDiagnostics: {
    orders: diagnostics,
    orderPaginationComplete: !hasNext,
    orderLimitReached: orders.length >= maxOrders,
    details: detailDiagnostics,
    inventory: inventoryDiagnostics,
  },
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  outputPath,
  period,
  ordersFetched: orders.length,
  productSeries: series.length,
  salesDaily: daily.size,
  dataQuality: snapshot.dataQuality.status,
}, null, 2));
await browser.close();
