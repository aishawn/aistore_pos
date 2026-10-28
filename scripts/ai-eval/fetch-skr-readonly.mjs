import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const base = (process.env.SKR_BASE_URL || "https://skr.orithos.com.au").replace(/\/+$/, "");
const username = process.env.SKR_USERNAME || "shawn";
const password = process.env.SKR_PASSWORD;
const outputPath = process.env.SKR_SNAPSHOT_OUTPUT || "data/ai-eval/skr-snapshot.json";
if (!password) throw new Error("SKR_PASSWORD is required");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ extraHTTPHeaders: { Origin: base } });
const api = context.request;
async function request(method, url, body) {
  const response = method === "GET"
    ? await api.get(url, { headers: { Origin: base } })
    : await api.post(url, { data: body, headers: { Origin: base } });
  return { response, json: await response.json().catch(() => ({})) };
}

const login = await request("POST", `${base}/api/auth/login`, { username, password });
console.error(JSON.stringify({ loginStatus: login.response.status(), loginCode: login.json.code, loginUser: login.json.data?.user?.username }, null, 2));
if (!login.response.ok || login.json.code !== 0) throw new Error(`SKR_LOGIN_FAILED_${login.response.status}`);
const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
if (accessCookie) {
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("sf_token", token);
    localStorage.setItem("sf_user", JSON.stringify(user));
  }, { token: accessCookie.value, user: login.json.data.user });
}
const page = await context.newPage();
await page.goto(`${base}/overview`, { waitUntil: "domcontentloaded", timeout: 60000 });
console.error(JSON.stringify({ pageUrl: page.url(), cookies: (await context.cookies(base)).map((cookie) => cookie.name), tokenInStorage: await page.evaluate(() => Boolean(localStorage.getItem("sf_token"))) }, null, 2));

const products = [];
const fetchDiagnostics = [];
let offset = 0;
let hasNext = true;
while (hasNext && offset <= 100000) {
  const pageResponse = await page.evaluate(async (payload) => {
    const token = localStorage.getItem("sf_token");
    const response = await fetch("/api/odoo/records", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { type: "products", limit: 100, offset });
  const pageJson = pageResponse.body;
  const items = Array.isArray(pageJson.items) ? pageJson.items : Array.isArray(pageJson.data?.items) ? pageJson.data.items : [];
  fetchDiagnostics.push({ offset, status: pageResponse.status, itemCount: items.length });
  if (pageResponse.status < 200 || pageResponse.status >= 300) {
    if (products.length) break;
    throw new Error(`SKR_PRODUCTS_FAILED_${pageResponse.status}`);
  }
  if (!items.length && offset === 0) {
    console.error(JSON.stringify({ productResponse: pageJson }, null, 2));
  }
  products.push(...items);
  hasNext = pageJson.hasNext === true || pageJson.data?.hasNext === true;
  offset += items.length;
  if (!items.length) break;
}

const numberOrNull = (value) => value === null || value === undefined || value === "" ? null : Number(value);
const text = (value) => String(value ?? "").trim();
const snapshot = {
  schemaVersion: 1,
  source: "skr-readonly-api",
  sourceBase: base,
  generatedAt: new Date().toISOString(),
  outletId: null,
  currency: "AUD",
  timezone: "Australia/Adelaide",
  products: products.map((item) => ({
    id: item.id ?? item.productId ?? item.odooId,
    name: text(item.name ?? item.display_name ?? item.displayName),
    barcode: text(item.barcode) || null,
    sku: text(item.default_code ?? item.defaultCode ?? item.sku) || null,
    category: text(item.category ?? item.categoryName) || null,
    brand: text(item.brand ?? item.brandName) || null,
    price: numberOrNull(item.price ?? item.list_price ?? item.listPrice),
    gstIncluded: item.gstIncluded ?? null,
    stock: numberOrNull(item.qty_available ?? item.quantityOnHand ?? item.stock),
    freeStock: numberOrNull(item.free_qty ?? item.freeQty),
    stockUpdatedAt: item.stockUpdatedAt ?? item.updatedAt ?? null,
  })).filter((item) => item.id !== undefined && item.name),
  customers: [],
  sales: [],
  suppliers: [],
  counts: { productsFetched: products.length },
  fetchDiagnostics,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, products: snapshot.products.length }, null, 2));
await browser.close();
