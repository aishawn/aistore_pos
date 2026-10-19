/** Fixture UAT for stock list and capped pricing save failure handling. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
const fixtureUser = { id: 1, name: "Admin", username: "admin", isAdmin: true, outletId: 1, vendorId: 1, pendingPasswordReset: false };
const checks = [];
const writes = [];
let stockPatches = 0;
let cappedPatches = 0;
const record = (name, ok, evidence = "") => checks.push({ name, status: ok ? "PASS" : "FAIL", evidence });
const pageData = (items) => ({ code: 0, message: "ok", data: { items, total: items.length, page: 1, size: 20 } });

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
  await context.addInitScript((user) => localStorage.setItem("sf_user", JSON.stringify(user)), fixtureUser);
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "PATCH") {
      writes.push(`${request.method()} ${url.pathname}`);
      if (url.pathname.startsWith("/api/stock-list/")) {
        stockPatches += 1;
        if (stockPatches === 1) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: 50301, message: "Stock row rejected", data: null }) });
        }
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "ok", data: null }) });
      }
      if (url.pathname === "/api/capped-pricing/current-price") {
        cappedPatches += 1;
        return route.fulfill({
          status: cappedPatches === 1 ? 503 : 200,
          contentType: "application/json",
          body: JSON.stringify({ code: cappedPatches === 1 ? 50301 : 0, message: cappedPatches === 1 ? "Capped price rejected" : "ok", data: null }),
        });
      }
      return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ message: "fixture write blocked" }) });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      writes.push(`${request.method()} ${url.pathname}`);
      return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ message: "fixture write blocked" }) });
    }
    if (url.pathname === "/api/stock-list") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pageData([{ id: "101", name: "DEMO Shiraz", categoryName: "Wine", priceSetName: "Default", priceQuantity: 1, priceId: "p1", cost: 10, price: 12, casesOnHand: 2, itemsOnHand: 4 }])) });
    }
    if (url.pathname === "/api/capped-pricing") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pageData([{ id: "c1", productId: "101", priceId: "p1", productName: "DEMO Shiraz", priceSetName: "Default", source: "Supplier", sourceType: "PROVIDED", startDate: "2026-01-01", endDate: "2026-12-31", quantity: 1, cappedPrice: 15, currentPrice: 12, cost: 10 }])) });
    }
    if (url.pathname === "/api/classifications/category") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "ok", data: [] }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "ok", data: fixtureUser }) });
  });

  const page = await context.newPage();
  await page.goto(`${base}/stock/list`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const stockName = page.getByLabel("Product name for DEMO Shiraz");
  await stockName.waitFor({ state: "visible", timeout: 30000 });
  const costInput = page.getByLabel("Cost for DEMO Shiraz");
  const priceInput = page.getByLabel("Price for DEMO Shiraz");
  await costInput.fill("11");
  await costInput.press("Tab");
  await priceInput.evaluate((element) => element.dispatchEvent(new FocusEvent("blur", { bubbles: true })));
  await page.getByRole("alert").getByText("Stock row rejected").waitFor({ state: "visible", timeout: 10000 });
  record("stock list reports failed save", true, "row alert shown after PATCH 503");
  record("stock list suppresses duplicate blur save", stockPatches === 1, `${stockPatches} PATCH after overlapping blur events`);
  record("stock list retains edited value for retry", await costInput.inputValue() === "11", await costInput.inputValue());
  await costInput.press("Tab");
  await page.waitForFunction(() => document.querySelector('[aria-label="Cost for DEMO Shiraz"]')?.getAttribute("aria-busy") !== "true");
  record("stock list retry succeeds", stockPatches === 2, `${stockPatches} PATCH attempts`);

  await page.goto(`${base}/stock/capped-pricing`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const cappedInput = page.locator('input[type="number"]').first();
  await cappedInput.waitFor({ state: "visible", timeout: 30000 });
  await cappedInput.fill("13.25");
  await cappedInput.press("Tab");
  await page.getByRole("alert").getByText("Capped price rejected").waitFor({ state: "visible", timeout: 10000 });
  record("capped pricing reports failed save", true, "cell alert shown after PATCH 503");
  record("capped pricing retains edited value", await cappedInput.inputValue() === "13.25", await cappedInput.inputValue());
  await cappedInput.focus();
  await cappedInput.press("Tab");
  await page.waitForFunction(() => document.querySelector('input[type="number"]')?.getAttribute("aria-busy") !== "true");
  record("capped pricing retry succeeds", cappedPatches === 2, `${cappedPatches} PATCH attempts`);
  record("fixture boundary only", writes.every((entry) => entry.startsWith("PATCH ")) && stockPatches + cappedPatches === writes.length, JSON.stringify(writes));
  await context.close();
} catch (error) {
  record("run", false, error instanceof Error ? error.message : "failed");
} finally {
  await browser.close();
}

const failed = checks.filter((check) => check.status === "FAIL").length;
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  environment: "local-dev-fixtures",
  target: base,
  scope: "Stock List and Capped Pricing save error handling; writes intercepted by Playwright",
  status: failed === 0 ? "PASS" : "FAIL",
  checks,
  writes,
  stockPatches,
  cappedPatches,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_STOCK_PRICING_SAVE_GUARD_LOCAL_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ outputPath, status: output.status, failed, stockPatches, cappedPatches }));
if (failed) process.exitCode = 1;
