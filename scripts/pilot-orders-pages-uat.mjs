import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");

const base = "https://app.orithos.com.au";
const deployment = process.env.PILOT_DEPLOYMENT_SHA || null;
const browser = await chromium.launch({ headless: true });
const results = [];
const errors = [];
const writes = [];
const readQueries = [];

async function retryTransient(operation, label) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const transient = /timeout|timed out|ECONNRESET|ECONNREFUSED|socket disconnected|ERR_CONNECTION_RESET/i.test(String(error));
      if (!transient || attempt === 3) throw new Error(`${label} failed after ${attempt} attempt(s): ${String(error)}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
}

for (const width of [390, 1440]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const login = await retryTransient(
    () => context.request.post(`${base}/api/auth/login`, {
      data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
      headers: { Origin: base },
      timeout: 60000,
    }),
    `login at ${width}px`,
  );
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`${width}px ${error.message}`));
  page.on("request", (request) => {
    const route = new URL(request.url()).pathname;
    if (route === "/api/odoo/records" && request.method() === "POST") readQueries.push("POST /api/odoo/records (read-only search)");
    else if (request.method() !== "GET" && route.startsWith("/api/")) writes.push(`${request.method()} ${route}`);
  });
  for (const route of [
    "/orders",
    "/orders/new",
    "/orders/manual",
    "/orders/receive/new",
    "/orders/transfer/new",
    "/orders/return/new",
    "/orders/credit/new",
    "/history/odoo",
  ]) {
    await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const titleByRoute = {
      "/orders": "Orders",
      "/orders/new": "Order Stock",
      "/orders/manual": "Create Order",
      "/orders/receive/new": "Receive Stock",
      "/orders/transfer/new": "Transfer Stock",
      "/orders/return/new": "Return Stock",
      "/orders/credit/new": "Create Credit Note",
      "/history/odoo": "Sales History",
    };
    const title = titleByRoute[route];
    await page.getByRole("heading", { name: title, exact: true }).waitFor({ state: "visible", timeout: 30000 });
    if (route === "/history/odoo") {
      await page.waitForFunction(() => !document.body.innerText.includes("Loading sales…"), { timeout: 30000 });
    }
    await page.waitForTimeout(1200);
    const state = await page.evaluate(() => ({
      width: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      title: document.querySelector("h1")?.textContent?.trim() ?? "",
      visibleInputs: [...document.querySelectorAll("input, select, textarea")].filter((item) => {
        const rect = item.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length,
      pageText: document.body.innerText,
    }));
    const historyState = route === "/history/odoo"
      ? /No Odoo sales are available for this account\./.test(state.pageText)
        ? "Empty-state: no Odoo sales available for this account"
        : /260-1-|\d{2,}-\d-\d{6}/.test(state.pageText)
          ? "Sales rows present"
          : /role=alert|Could not load Odoo sales/.test(state.pageText)
            ? "Sales history error state"
            : "Sales history state needs review"
      : null;
    const isTransactionForm = ["/orders/manual", "/orders/receive/new", "/orders/transfer/new", "/orders/return/new", "/orders/credit/new"].includes(route);
    const stateOkay = route === "/history/odoo"
      ? historyState === "Sales rows present" || historyState.startsWith("Empty-state")
      : isTransactionForm
      ? state.visibleInputs > 0
      : route === "/orders/new"
        ? /This week|purchase plan/i.test(state.pageText) && /Manual order/.test(state.pageText)
        : /Orders/.test(state.pageText);
    results.push({
      viewport: width,
      route,
      documentWidth: state.documentWidth,
      bodyWidth: state.bodyWidth,
      title: state.title,
      visibleInputs: state.visibleInputs,
      status: state.documentWidth <= width && state.bodyWidth <= width && stateOkay ? "PASS" : "FAIL",
      state: isTransactionForm ? `Empty ${title.toLowerCase()} form; not submitted` : route === "/orders/new" ? "Live supply-chain plan viewed read-only" : route === "/history/odoo" ? historyState : "Orders list viewed read-only",
    });
  }
  await context.close();
}

await browser.close();
const failed = results.filter((result) => result.status !== "PASS");
const report = {
  generatedAt: new Date().toISOString(),
  deployment,
  target: base,
  scope: "authenticated read-only orders list, supply-chain plan, and manual order form responsive checks; no order submitted",
  routes: ["/orders", "/orders/new", "/orders/manual", "/orders/receive/new", "/orders/transfer/new", "/orders/return/new", "/orders/credit/new", "/history/odoo"],
  viewports: [390, 1440],
  passed: results.length - failed.length,
  failed: failed.length,
  results,
  sideEffects: { mutatingApiRequests: writes, readOnlyQueries: readQueries, pageErrors: errors },
  limitations: ["Production supplier and order data remain empty; populated workflows and actual order creation were not exercised."],
};
const outputPath = path.join(root, "docs/UAT_ORDER_PAGES_2026-10-14.json");
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: report.passed, failed: report.failed, mutatingApiRequests: writes, readOnlyQueries: readQueries.length, pageErrors: errors }));
if (failed.length || writes.length || errors.length) process.exitCode = 1;
