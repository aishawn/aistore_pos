import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au";
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const checks = [];
const writes = [];
let detailRequests = 0;
let taxRateRequests = 0;
try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password, subdomain: process.env.PILOT_SUBDOMAIN ?? env.PILOT_SUBDOMAIN ?? "demo" },
    headers: { Origin: base, "X-Orithos-Tenant-Slug": process.env.PILOT_SUBDOMAIN ?? env.PILOT_SUBDOMAIN ?? "demo" },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(`${request.method()} ${url.pathname}`);
  });
  await page.route("**/api/products/*", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET" || !/^\/api\/products\/\d+$/.test(url.pathname)) return route.continue();
    detailRequests += 1;
    if (detailRequests === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Injected product detail failure" }) });
    return route.continue();
  });
  await page.route("**/api/tax-rates", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    taxRateRequests += 1;
    if (taxRateRequests === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Injected tax rate failure" }) });
    return route.continue();
  });

  await page.goto(`${base}/products/1/view`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: "Retry" }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Retry" }).click();
  await page.getByRole("heading", { name: "Product Report" }).waitFor({ timeout: 30000 });
  const dependencyAlert = page.getByRole("alert").filter({ hasText: "Tax rates:" });
  await dependencyAlert.waitFor({ timeout: 15000 });
  await dependencyAlert.getByRole("button", { name: "Retry" }).click();
  await dependencyAlert.waitFor({ state: "detached", timeout: 30000 });

  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  checks.push({
    name: "Product detail lookup read failure recovers in place",
    status: detailRequests >= 2 && taxRateRequests >= 2 && dimensions.document <= dimensions.viewport && pageErrors.length === 0 ? "PASS" : "FAIL",
    evidence: { detailRequests, taxRateRequests, taxRateRetryRendered: true, viewport: dimensions, pageErrors },
  });
} finally {
  try { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); } catch { /* Session expires normally. */ }
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  deployment: process.env.PILOT_DEPLOYMENT_SHA ?? null,
  target: base,
  scope: "read-only product detail GET failure injection; one GET returns 503; Retry GETs continue to production; no business writes",
  checks,
  writes,
};
const outputPath = path.join(root, "docs", "UAT_PRODUCT_VIEW_RETRY_2026-10-18.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, checks, writes }));
if (checks.some((check) => check.status !== "PASS") || writes.length) process.exitCode = 2;
