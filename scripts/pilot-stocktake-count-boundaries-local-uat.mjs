/** Browser checks for draft-count limits, accidental clearing and failed-apply recovery. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
const checks = [];
const products = Array.from({ length: 41 }, (_, index) => ({
  id: 7301 + index, name: `Fixture wine ${index + 1}`, sku: `FIX-${index + 1}`,
  barcode: `9300000000${String(index + 1).padStart(2, "0")}`,
  uom: "Units", expectedQty: 5, eligible: true, ineligibleReason: null,
}));
const record = (viewport, name, ok, evidence = "") => checks.push({ viewport, name, status: ok ? "PASS" : "FAIL", evidence });
const envelope = (data) => ({ code: 0, message: "ok", data });
const browser = await chromium.launch({ headless: true });
const interceptedApplyRequests = [];
const blockedWrites = [];

try {
  for (const width of [390, 1024]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
    await context.addInitScript(() => localStorage.setItem("sf_user", JSON.stringify({ id: 1, username: "admin", name: "Fixture Admin", isAdmin: true })));
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    let applyAttempts = 0;
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === "/api/odoo/stocktake" && request.method() === "GET") {
        const q = url.searchParams.get("q") ?? "";
        return route.fulfill({ json: envelope({
          locations: [{ id: 7101, name: "Fixture warehouse" }], defaultLocationId: 7101,
          selectedLocation: { id: 7101, name: "Fixture warehouse" }, locationSource: "tenant-binding",
          writeEnabled: true, products: q === "fixture" ? products : products.filter((product) => product.barcode === q),
        }) });
      }
      if (url.pathname === "/api/odoo/stocktake" && request.method() === "POST") {
        applyAttempts += 1;
        interceptedApplyRequests.push({ viewport: width, attempt: applyAttempts, body: request.postDataJSON() });
        if (applyAttempts === 1) {
          await new Promise((resolve) => setTimeout(resolve, 350));
          return route.fulfill({ status: 503, json: { code: 50300, message: "Fixture adjustment rejected", data: null } });
        }
        return route.fulfill({ json: envelope({ applied: 1, locationName: "Fixture warehouse", adjustmentReferenceIds: [8801] }) });
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        blockedWrites.push({ viewport: width, method: request.method(), path: url.pathname });
        return route.fulfill({ status: 405, json: { code: 40500, message: "Fixture write blocked", data: null } });
      }
      return route.fulfill({ json: envelope([]) });
    });
    try {
      await page.goto(`${base}/stock/stocktake`, { waitUntil: "domcontentloaded", timeout: 60000 });
      const search = page.getByLabel("Search or scan a product");
      await search.fill("fixture");
      await page.getByRole("button", { name: "Add to count", exact: true }).first().waitFor();
      for (let index = 0; index < 40; index += 1) await page.getByRole("button", { name: "Add to count", exact: true }).first().click();
      const counted = page.getByRole("region", { name: "Counted products" });
      await Promise.all([
        page.waitForResponse((response) => new URL(response.url()).searchParams.get("q") === products[40].barcode),
        search.fill(products[40].barcode),
      ]);
      await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 1);
      await page.getByRole("option").filter({ hasText: products[40].name }).waitFor();
      await search.press("Enter");
      record(width, "barcode cannot exceed 40-line limit", await counted.getByText("40 products", { exact: true }).count() === 1,
        await counted.locator("header").innerText());
      record(width, "count limit is explained", await page.getByRole("status").filter({ hasText: "This count has 40 products." }).isVisible());
      const firstCount = page.locator('input[aria-label="Counted quantity for Fixture wine 1"]:visible');
      await firstCount.fill("4");
      await page.getByRole("button", { name: "Clear count", exact: true }).click();
      const clearDialog = page.getByRole("alertdialog", { name: "Clear this count?" });
      const clearConfirmationVisible = await clearDialog.isVisible();
      record(width, "clear count asks before discarding entries", clearConfirmationVisible);
      if (clearConfirmationVisible) {
        await clearDialog.getByRole("button", { name: "Cancel", exact: true }).click();
        record(width, "cancel clear preserves entered quantity", await firstCount.inputValue() === "4" && applyAttempts === 0);
        await page.getByRole("button", { name: "Clear count", exact: true }).click();
        await clearDialog.getByRole("button", { name: "Clear count", exact: true }).click();
        record(width, "confirmed clear removes local draft without API writes", await counted.getByText("0 products", { exact: true }).isVisible() && applyAttempts === 0);
      }

      await Promise.all([
        page.waitForResponse((response) => new URL(response.url()).searchParams.get("q") === products[0].barcode),
        search.fill(products[0].barcode),
      ]);
      await page.getByRole("option").getByText(products[0].name, { exact: true }).waitFor();
      await page.getByRole("button", { name: "Add to count", exact: true }).click();
      await firstCount.fill("4");
      await page.getByRole("button", { name: "Review and apply", exact: true }).click();
      const applyDialog = page.getByRole("alertdialog", { name: "Apply stock adjustments?" });
      await applyDialog.getByRole("button", { name: "Apply adjustments", exact: true }).click();
      const busyButton = applyDialog.getByRole("button", { name: "Applying…", exact: true });
      record(width, "apply prevents repeat confirmation while pending", await busyButton.isDisabled());
      await applyDialog.getByRole("alert").filter({ hasText: "Fixture adjustment rejected" }).waitFor();
      record(width, "failed apply retains count and enables retry", await firstCount.inputValue() === "4"
        && await applyDialog.getByRole("button", { name: "Apply adjustments", exact: true }).isEnabled() && applyAttempts === 1);
      await applyDialog.getByRole("button", { name: "Cancel", exact: true }).click();
      record(width, "cancel after failure retains local draft", await firstCount.inputValue() === "4");
      await page.getByRole("button", { name: "Review and apply", exact: true }).click();
      await applyDialog.getByRole("button", { name: "Apply adjustments", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "Applied 1 stock adjustment" }).waitFor();
      record(width, "retry sends same count and clears draft after success", applyAttempts === 2
        && await counted.getByText("0 products", { exact: true }).isVisible()
        && JSON.stringify(interceptedApplyRequests.at(-1)?.body) === JSON.stringify(interceptedApplyRequests.at(-2)?.body));
      record(width, "no browser errors", pageErrors.length === 0, JSON.stringify(pageErrors));
    } catch (error) {
      record(width, "run", false, error instanceof Error ? error.message : "failed");
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const failed = checks.filter((check) => check.status === "FAIL").length;
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_STOCKTAKE_COUNT_BOUNDARIES_LOCAL_CURRENT.json");
const output = {
  generatedAt: new Date().toISOString(), sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceWorkingTree: true, nodeVersion: process.version, environment: "local-dev-fixtures", target: base,
  scope: "Stocktake count limits, clear confirmation and apply failure recovery; every API intercepted; no real business writes",
  status: failed === 0 && blockedWrites.length === 0 ? "PASS" : "FAIL", checks, interceptedApplyRequests, blockedWrites,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, failed }));
if (output.status !== "PASS") process.exitCode = 1;
