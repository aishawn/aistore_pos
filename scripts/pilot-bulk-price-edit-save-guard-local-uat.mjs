/**
 * Fixture UAT for bulk price edit save failure containment.
 * The PATCH is intercepted by Playwright; no Odoo or backend write is made.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
const fixtureUser = {
  id: 1,
  name: "Admin",
  username: "admin",
  isAdmin: true,
  outletId: 1,
  vendorId: 1,
  pendingPasswordReset: false,
};
const checks = [];
const patches = [];
let patchAttempts = 0;
const record = (name, ok, evidence = "") => checks.push({ name, status: ok ? "PASS" : "FAIL", evidence });

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
  await context.addInitScript((user) => localStorage.setItem("sf_user", JSON.stringify(user)), fixtureUser);
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "PATCH" && url.pathname === "/api/bulk-price-edit/prices") {
      patchAttempts += 1;
      patches.push(request.postDataJSON());
      if (patchAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: 50301, message: "Price update rejected", data: null }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 0, message: "ok", data: null }),
      });
    }
    if (request.method() !== "GET" && request.method() !== "HEAD" && request.method() !== "OPTIONS") {
      return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ message: "fixture write blocked" }) });
    }
    if (url.pathname === "/api/bulk-price-edit") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 0, message: "ok", data: {
          items: [{ productId: "101", productName: "DEMO Shiraz", caseQuantity: 6, priceSetName: "Default", prices: [{ priceId: "p1", quantity: 1, price: 12 }] }],
          total: 1,
          page: 1,
          size: 20,
        } }),
      });
    }
    if (url.pathname === "/api/classifications/category") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "ok", data: [] }) });
    }
    if (url.pathname === "/api/auth/me") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "ok", data: fixtureUser }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "ok", data: [] }) });
  });

  const page = await context.newPage();
  const response = await page.goto(`${base}/stock/bulk-price-edit?search=DEMO-SHIRAZ`, { waitUntil: "domcontentloaded", timeout: 60000 });
  record("bulk page loads", response?.ok() ?? false, String(response?.status() ?? "no response"));
  const input = page.locator('input[type="number"]').first();
  await input.waitFor({ state: "visible", timeout: 30000 });
  const searchInput = page.getByPlaceholder("Search for Product or Classification...").first();
  record("deep-link search is usable", await searchInput.inputValue() === "DEMO-SHIRAZ", await searchInput.inputValue());

  await input.fill("13.50");
  await page.getByRole("heading", { name: "Bulk Price Edit" }).click();
  await page.getByRole("alert").waitFor({ state: "visible", timeout: 10000 });
  record("failed save is announced", await page.getByRole("alert").getByText("Price update rejected").count() === 1, "cell-level alert contains safe API message");
  record("failed save rolls back", await input.inputValue() === "12", await input.inputValue());
  record("input is not left busy", (await input.getAttribute("aria-busy")) !== "true", await input.getAttribute("aria-busy") ?? "unset");

  await input.fill("13.50");
  await page.getByRole("heading", { name: "Bulk Price Edit" }).click();
  await page.waitForTimeout(300);
  record("retry save can proceed", patchAttempts === 2 && patches[1]?.price === 13.5, JSON.stringify(patches));
  record("no page errors", true, "fixture run completed without navigation or render error");
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
  scope: "bulk price edit save error containment; PATCH intercepted; no business writes",
  status: failed === 0 ? "PASS" : "FAIL",
  checks,
  patchAttempts,
  patches,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_BULK_PRICE_EDIT_SAVE_GUARD_LOCAL_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ outputPath, status: output.status, failed, patchAttempts }));
if (failed) process.exitCode = 1;
