import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
const browser = await chromium.launch({ headless: true });
const results = [];
let postRequests = [];

function envelope(data) {
  return { code: 0, message: "OK", data };
}

async function runViewport(viewport) {
  const writeEnabled = viewport.width !== 768;
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
  await context.addInitScript(() => {
    localStorage.setItem("sf_token", "local-uat-session");
    localStorage.setItem("sf_user", JSON.stringify({ id: "uat-admin", name: "UAT Admin", username: "admin", isAdmin: true }));
  });
  const page = await context.newPage();
  const pageErrors = [];
  let interceptedWrites = 0;
  const stocktakeReads = [];
  let locationFailuresRemaining = viewport.width === 390 ? 1 : 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/odoo/stocktake" && request.method() === "GET") {
      const query = url.searchParams.get("q") ?? "";
      if (!query && locationFailuresRemaining > 0) {
        locationFailuresRemaining -= 1;
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: 50300, message: "Fixture location read failed once", data: null }) });
      }
      const products = query ? [
        { id: 7301, name: "Demo Chardonnay", sku: "DEMO-CH-01", barcode: "930000000001", uom: "Units", expectedQty: 5, eligible: true, ineligibleReason: null },
        { id: 7302, name: "Demo Shiraz", sku: "DEMO-SH-02", barcode: "930000000002", uom: "Units", expectedQty: 10, eligible: true, ineligibleReason: null },
      ].filter((product) => query.toLowerCase() === "demo"
        ? product.id === 7301
        : `${product.name} ${product.sku} ${product.barcode}`.toLowerCase().includes(query.toLowerCase())) : [];
      stocktakeReads.push({ query, writeEnabled });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(envelope({
        locations: [{ id: 7101, name: "Main Warehouse / Stock" }],
        defaultLocationId: 7101,
        selectedLocation: { id: 7101, name: "Main Warehouse / Stock" },
        locationSource: "tenant-binding",
        writeEnabled,
        products,
      })) });
    }
    if (url.pathname === "/api/odoo/stocktake" && request.method() === "POST") {
      interceptedWrites += 1;
      const body = request.postDataJSON();
      postRequests.push({ viewport: viewport.width, body });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(envelope({ applied: body.lines.length, locationName: "Main Warehouse / Stock", adjustmentReferenceIds: body.lines.map((line, index) => 8800 + index), lines: body.lines })) });
    }
    if (request.method() !== "GET") {
      return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "Local UAT blocks API writes", data: null }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(envelope([])) });
  });

  try {
    await page.goto(`${base}/stock/stocktake?__uat_probe=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: "Odoo Stocktake" }).waitFor({ timeout: 30000 });
    let locationRetryRecovered = true;
    if (viewport.width === 390) {
      const locationAlert = page.getByRole("alert").filter({ hasText: "Fixture location read failed once" });
      await locationAlert.waitFor({ state: "visible", timeout: 10000 });
      await locationAlert.getByRole("button", { name: "Retry" }).click();
      await locationAlert.waitFor({ state: "detached", timeout: 10000 });
      locationRetryRecovered = locationFailuresRemaining === 0;
    }
    const locationSelect = page.locator("#stocktake-location");
    await locationSelect.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForFunction(() => {
      const select = document.querySelector("#stocktake-location");
      return select instanceof HTMLSelectElement && select.value === "7101";
    }, undefined, { timeout: 10000 });
    if (await locationSelect.inputValue() !== "7101") throw new Error("DEFAULT_STOCK_LOCATION_NOT_SELECTED");
    const search = page.getByLabel("Search or scan a product");
    await search.fill("DEMO");
    await page.getByText("Demo Chardonnay", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Add to count" }).first().click();
    await search.fill("930000000002");
    await page.getByText("Demo Shiraz", { exact: true }).waitFor({ timeout: 10000 });
    await search.press("Enter");
    await page.locator('input[aria-label="Counted quantity for Demo Chardonnay"]:visible').fill("4");
    await page.locator('input[aria-label="Counted quantity for Demo Shiraz"]:visible').fill("9");
    const visibleCountRow = viewport.width < 768
      ? page.locator("article:visible").filter({ hasText: "Demo Chardonnay" })
      : page.locator("tbody tr:visible").filter({ hasText: "Demo Chardonnay" });
    await visibleCountRow.getByText("-1", { exact: true }).waitFor({ timeout: 5000 });
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    const screenshotPath = path.join(root, "docs", "screenshots", "2026-10-19-stocktake", `stocktake-${viewport.width}.png`);
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const reviewButton = page.getByRole("button", { name: "Review and apply" });
    let cancelKeptNoWrite = false;
    if (writeEnabled) {
      if (await reviewButton.isDisabled()) {
        throw new Error(`REVIEW_DISABLED_${JSON.stringify({ body: (await page.locator("body").innerText()).slice(-1200), counts: await page.locator('input[aria-label^="Counted quantity for"]:visible').evaluateAll((items) => items.map((item) => item.value)), stocktakeReads })}`);
      }
      await reviewButton.click();
      const dialog = page.getByRole("alertdialog", { name: "Apply stock adjustments?" });
      await dialog.waitFor({ state: "visible", timeout: 5000 });
      await dialog.getByRole("button", { name: "Cancel" }).click();
      cancelKeptNoWrite = interceptedWrites === 0;
    } else {
      cancelKeptNoWrite = await reviewButton.isDisabled() && interceptedWrites === 0;
    }

    let confirmedExactlyOnce = false;
    let confirmationPayloadValid = false;
    if (writeEnabled) {
      await page.getByRole("button", { name: "Review and apply" }).click();
      await page.getByRole("alertdialog", { name: "Apply stock adjustments?" }).getByRole("button", { name: "Apply adjustments" }).click();
      await page.getByRole("status").filter({ hasText: "Applied 2 stock adjustments" }).waitFor({ timeout: 10000 });
      const successText = await page.getByRole("status").filter({ hasText: "Applied 2 stock adjustments" }).textContent();
      const adjustmentReferenceVisible = /Odoo quant 8800, 8801/.test(successText ?? "");
      confirmedExactlyOnce = interceptedWrites === 1;
      const payload = postRequests.at(-1)?.body;
      confirmationPayloadValid = payload?.confirm === true
        && payload?.locationId === 7101
        && payload?.lines?.length === 2
        && payload?.lines[0]?.productId === 7301
        && adjustmentReferenceVisible
        && payload?.lines[0]?.expectedQty === 5
        && payload?.lines[0]?.countedQty === 4
        && payload?.lines[1]?.productId === 7302
        && payload?.lines[1]?.expectedQty === 10
        && payload?.lines[1]?.countedQty === 9;
    } else {
      const review = page.getByRole("button", { name: "Review and apply" });
      confirmationPayloadValid = await review.isDisabled();
      confirmedExactlyOnce = interceptedWrites === 0;
    }

    results.push({
      viewport: viewport.width,
      writeEnabled,
      cancelKeptNoWrite,
      confirmedExactlyOnce,
      confirmationPayloadValid,
      horizontalOverflow,
      pageErrors,
      locationRetryRecovered,
      screenshotPath,
    });
  } finally {
    await context.close();
  }
}

try {
  await runViewport({ width: 390, height: 844 });
  await runViewport({ width: 1440, height: 900 });
  await runViewport({ width: 768, height: 1024 });
} finally {
  await browser.close();
}

const failures = results.filter((result) => !result.cancelKeptNoWrite
  || !result.confirmedExactlyOnce
  || !result.confirmationPayloadValid
  || result.horizontalOverflow
  || !result.locationRetryRecovered
  || result.pageErrors.length > 0);
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  environment: "local-dev-fixtures",
  target: base,
  scope: "Odoo stocktake UI only; all APIs intercepted locally; no Odoo calls or inventory writes",
  status: failures.length === 0 && results.length === 3 ? "PASS" : "FAIL",
  checks: results,
  interceptedApplyRequests: postRequests.length,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_ODOO_STOCKTAKE_LOCAL_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: results, interceptedApplyRequests: postRequests.length }));
if (output.status !== "PASS") process.exitCode = 1;
