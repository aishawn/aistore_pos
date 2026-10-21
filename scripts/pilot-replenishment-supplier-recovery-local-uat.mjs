/** Supplier-load and RFQ-submit recovery with a fully intercepted local browser. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
if (!new URL(base).hostname.endsWith(".localhost") && new URL(base).hostname !== "localhost") throw new Error("LOCAL_FIXTURE_TARGET_REQUIRED");
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_REPLENISHMENT_SUPPLIER_RECOVERY_CURRENT.json");
const screenshotDir = path.resolve(root, process.env.PILOT_UAT_SCREENSHOT_DIR ?? "docs/screenshots/replenishment-supplier-recovery-local");
fs.mkdirSync(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [], fixtureWrites = [], blockedWrites = [];
try {
  for (const width of [320, 390, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
    await context.addInitScript(() => localStorage.setItem("sf_user", JSON.stringify({ id: 1, username: "admin", name: "Fixture Admin", isAdmin: true })));
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const record = (name, ok, evidence = null) => checks.push({ viewport: width, name, status: ok ? "PASS" : "FAIL", evidence });
    let supplierAttempts = 0, submitAttempts = 0, planAttempts = 0, coverageFailures = 1, releaseCoverage;
    await context.route("**/api/**", async (route) => {
      const request = route.request(), pathname = new URL(request.url()).pathname;
      if (pathname === "/api/odoo/replenishment" && request.method() === "GET") {
        planAttempts += 1;
        const days = Number(new URL(request.url()).searchParams.get("coverageDays"));
        if (planAttempts === 1) return route.fulfill({ status: 503, json: { message: "Fixture plan unavailable" } });
        if (days === 7) await new Promise((resolve) => { releaseCoverage = resolve; });
        if (days === 42 && coverageFailures > 0) {
          coverageFailures -= 1;
          return route.fulfill({ status: 503, json: { message: "Fixture coverage refresh unavailable" } });
        }
        return route.fulfill({ json: {
        company: "Fixture store", historyDays: 56, periodDays: 28, coverageDays: days, truncated: false, generatedAt: "2026-10-21T01:00:00Z",
        products: [{ id: 481, name: "Fixture Shiraz", sku: "FIX-481", unit: "Units", soldUnits: 42, recentUnits: 24, previousUnits: 18, unitsPerDay: 0.79, trendPercent: 33, trend: "up", onHand: 8, forecastStock: 8, daysOfStock: 10, suggestedQuantity: 9, reason: "Fixture demand forecast", reasonParts: ["Fixture demand forecast"], method: "rules_v1_weighted_velocity" }],
      } });
      }
      if (pathname === "/api/odoo/purchase-requests" && request.method() === "GET") {
        supplierAttempts += 1;
        if (supplierAttempts === 1) return route.fulfill({ status: 503, json: { message: "Fixture suppliers unavailable" } });
        return route.fulfill({ json: { suppliers: [{ id: 77, name: "Fixture supplier", email: "fixture@example.invalid" }] } });
      }
      if (pathname === "/api/odoo/purchase-requests" && request.method() === "POST") {
        submitAttempts += 1;
        fixtureWrites.push({ viewport: width, body: request.postDataJSON() });
        if (submitAttempts === 1) return route.fulfill({ status: 503, json: { message: "Fixture draft creation rejected" } });
        return route.fulfill({ json: { id: 887766, name: "FIXTURE-RFQ-001", supplier: "Fixture supplier", url: "https://example.invalid/fixture-rfq", auditSaved: true } });
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        blockedWrites.push({ method: request.method(), path: pathname });
        return route.fulfill({ status: 405, json: { message: "Fixture blocks unexpected writes" } });
      }
      if (pathname === "/api/odoo/pos-bootstrap") return route.fulfill({ json: { configs: [] } });
      return route.fulfill({ json: { code: 0, data: [] } });
    });
    try {
      await page.goto(`${base}/stock/replenishment`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByRole("heading", { name: "Connect Odoo to plan replenishment", exact: true }).waitFor();
      const initialRetry = page.getByRole("button", { name: "Retry", exact: true });
      const hasPlanRetry = await initialRetry.isVisible();
      record("initial Odoo failure offers retry without leaving page", hasPlanRetry);
      if (hasPlanRetry) await initialRetry.click();
      else await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /^Create draft RFQ/ }).click();
      const dialog = page.getByRole("dialog", { name: "Review draft RFQ", exact: true });
      await dialog.getByRole("alert").filter({ hasText: "Fixture suppliers unavailable" }).waitFor();
      const quantity = dialog.getByRole("spinbutton", { name: "Order quantity", exact: true });
      await quantity.fill("7");
      record("supplier failure blocks draft creation", await dialog.getByRole("button", { name: "Create draft RFQ", exact: true }).isDisabled());
      const retry = dialog.getByRole("button", { name: "Retry suppliers", exact: true });
      const canRetry = await retry.isVisible();
      record("supplier failure has an in-place retry", canRetry);
      await page.screenshot({ path: path.join(screenshotDir, `supplier-error-${width}.png`), fullPage: true });
      if (canRetry) {
        await retry.click();
        await dialog.getByRole("combobox").getByRole("option", { name: /Fixture supplier/ }).waitFor({ state: "attached" });
        record("retry keeps manually edited order quantity", await quantity.inputValue() === "7");
        record("single supplier is selected after recovery", await dialog.getByRole("combobox").inputValue() === "77");
        record("supplier error clears after recovery", await dialog.getByRole("alert").count() === 0 && supplierAttempts === 2);
        await dialog.getByRole("button", { name: "Create draft RFQ", exact: true }).click();
        await dialog.getByRole("alert").filter({ hasText: "Fixture draft creation rejected" }).waitFor();
        record("failed RFQ retains supplier and edited quantity", await quantity.inputValue() === "7" && await dialog.getByRole("combobox").inputValue() === "77");
        record("supplier retry is not shown for RFQ submission failure", await retry.count() === 0);
        await dialog.getByRole("button", { name: "Create draft RFQ", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        await page.getByRole("status").filter({ hasText: "FIXTURE-RFQ-001" }).waitFor();
        const writes = fixtureWrites.filter((item) => item.viewport === width);
        record("submit retry sends same reviewed quantities and audit", writes.length === 2 && JSON.stringify(writes[0].body) === JSON.stringify(writes[1].body));
        record("mock success explains draft-only status", await page.getByRole("status").filter({ hasText: "It has not been sent or confirmed." }).isVisible());
      }
      const create = page.getByRole("button", { name: /^Create draft RFQ/ });
      const coverageStarted = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/odoo/replenishment" && new URL(request.url()).searchParams.get("coverageDays") === "7");
      await page.getByRole("combobox", { name: "Coverage target", exact: true }).selectOption("7");
      await coverageStarted;
      record("coverage change blocks RFQ from the previous plan", await create.isDisabled());
      record("coverage update announces pending plan", await page.getByRole("status").filter({ hasText: "Updating replenishment plan" }).isVisible());
      const coverageResponse = page.waitForResponse((response) => new URL(response.url()).searchParams.get("coverageDays") === "7");
      releaseCoverage();
      await coverageResponse;
      await create.waitFor();
      await page.getByRole("combobox", { name: "Coverage target", exact: true }).selectOption("42");
      await page.getByRole("alert").filter({ hasText: "Fixture coverage refresh unavailable" }).waitFor();
      record("failed coverage refresh blocks RFQ from stale suggestions", await create.isDisabled());
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Fixture coverage refresh unavailable" }).waitFor({ state: "hidden" });
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Create draft RFQ") && !button.disabled));
      record("successful coverage retry re-enables reviewed plan", await create.isEnabled());
      record("no page JS errors or viewport overflow", errors.length === 0 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), errors);
    } catch (error) { record("run", false, error instanceof Error ? error.message : "Unexpected failure"); releaseCoverage?.(); }
    finally { await context.close(); }
  }
} finally { await browser.close(); }
const failed = checks.filter((check) => check.status === "FAIL").length;
const output = { generatedAt: new Date().toISOString(), sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), sourceWorkingTree: true, nodeVersion: process.version, target: base, scope: "Local browser fixtures for supplier retry and RFQ failure recovery; all APIs intercepted; no Odoo writes", status: failed === 0 && !blockedWrites.length ? "PASS" : "FAIL", checks, fixtureWrites, blockedWrites };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, failed }));
if (output.status !== "PASS") process.exitCode = 1;
