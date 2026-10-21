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
const viewportWidth = Number(process.env.PILOT_VIEWPORT_WIDTH ?? 1440);
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
  const context = await browser.newContext({ viewport: { width: viewportWidth, height: 900 } });
  await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
  await context.addInitScript((user) => localStorage.setItem("sf_user", JSON.stringify(user)), fixtureUser);
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "PATCH" && url.pathname === "/api/odoo/products/101") {
      patchAttempts += 1;
      patches.push(request.postDataJSON());
      return route.fulfill({
        status: patchAttempts === 1 ? 503 : 200,
        contentType: "application/json",
        body: JSON.stringify(patchAttempts === 1
          ? { message: "Price update could not be confirmed.", resultState: "unknown" }
          : { ok: true }),
      });
    }
    if (request.method() === "POST" && url.pathname === "/api/odoo/records") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [{ id: 101, name: "DEMO Shiraz", display_name: "DEMO Shiraz", barcode: false, default_code: "DEMO-SHIRAZ", list_price: 12, taxes_id: [], price_included: 12, price_tax: 0, qty_available: 4, free_qty: 4, uom_id: [1, "Units"], pos_categ_ids: [], available_in_pos: true }], limit: 30, offset: 0 }),
      });
    }
    if (request.method() !== "GET" && request.method() !== "HEAD" && request.method() !== "OPTIONS") {
      return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ message: "fixture write blocked" }) });
    }
    if (request.method() === "GET" && url.pathname === "/api/odoo/products/101") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 101, list_price: 12 }) });
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
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const response = await page.goto(`${base}/stock/bulk-price-edit?search=DEMO-SHIRAZ`, { waitUntil: "domcontentloaded", timeout: 60000 });
  record("bulk page loads", response?.ok() ?? false, String(response?.status() ?? "no response"));
  const input = page.locator('input[type="number"]').first();
  await input.waitFor({ state: "visible", timeout: 30000 });
  const searchInput = page.getByRole("textbox", { name: "Search bulk price products" });
  record("deep-link search is usable", await searchInput.inputValue() === "DEMO-SHIRAZ", await searchInput.inputValue());

  await input.fill("13.50");
  await page.getByRole("checkbox", { name: "I have reviewed these changes." }).check();
  await page.getByRole("button", { name: "Save reviewed prices", exact: true }).click();
  const saveAlert = page.getByText("Result pending confirmation. Check Odoo before making another change.", { exact: true });
  await saveAlert.waitFor({ state: "visible", timeout: 10000 });
  record("unknown save is announced", await saveAlert.getAttribute("role") === "status", "read-back result is explicitly pending confirmation");
  record("uncertain value stays visible", await input.inputValue() === "13.50", await input.inputValue());
  record("automatic retry is disabled", patchAttempts === 1 && await page.getByRole("button", { name: "Save reviewed prices", exact: true }).isDisabled(), JSON.stringify(patches));
  record("no page errors", pageErrors.length === 0, JSON.stringify(pageErrors));
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
  sourceWorkingTree: true,
  nodeVersion: process.version,
  viewport: viewportWidth,
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
