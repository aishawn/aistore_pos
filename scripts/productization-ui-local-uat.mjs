import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
if (!new URL(base).hostname.endsWith(".localhost") && !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("This fixture UAT is local-only.");
const importedFixtureName = "[R2-11eee66f71b39c7abc790636865404] R2 TEST | Fixture Shiraz";
const screenshotDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR ?? "docs/screenshots/2026-10-21-productization");
fs.mkdirSync(screenshotDir, { recursive: true });
const checks = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    const user = { id: 1, username: "fixture", name: "Fixture Admin", isAdmin: true, vendorId: 1, outletId: 1 };
    await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
    await context.addInitScript((value) => localStorage.setItem("sf_user", JSON.stringify(value)), user);
    let savedPrice = 12;
    let writeCount = 0;
    let classicCalls = 0;
    let unknown = false;
    const pageErrors = [];
    await context.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      const fulfill = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.pathname.startsWith("/api/bulk-price-edit")) { classicCalls++; return fulfill({ message: "Classic must not be called" }, 500); }
      if (url.pathname === "/api/auth/me") return fulfill({ code: 0, data: user });
      if (url.pathname === "/api/odoo/session") return fulfill({ user, autoRecoverConfigured: true });
      if (url.pathname === "/api/odoo/pos-bootstrap") return fulfill({ configs: [] });
      if (url.pathname === "/api/odoo/price-suggestions") return fulfill({
        company: "Fixture Store", historyDays: 28, marginTarget: 0.3, writeEnabled: false, truncated: false,
        nextOffset: null, generatedAt: new Date().toISOString(), products: [{ id: 1, name: importedFixtureName, sku: "FIXTURE-SHIRAZ", soldUnits: 12, onHand: 4, cost: 10, currentPrice: 12, currentListPrice: 12, currentNetPrice: 10.91, currentGst: 1.09, currentMargin: 0.0834, suggestedPrice: 15.75, suggestedListPrice: 15.75, suggestedNetPrice: 14.32, suggestedGst: 1.43, suggestedMargin: 0.3017, status: "raise", reason: "Margin on net sales excluding GST." }],
      });
      if (url.pathname === "/api/odoo/records") return fulfill({ items: [{ id: 1, name: importedFixtureName, default_code: "FIXTURE-SHIRAZ", list_price: savedPrice }], limit: 30, offset: 0 });
      if (url.pathname === "/api/odoo/products/1") {
        if (method === "GET") return unknown ? fulfill({ message: "Unavailable" }, 502) : fulfill({ id: 1, name: importedFixtureName, list_price: savedPrice });
        if (method === "PATCH") {
          writeCount++;
          const body = route.request().postDataJSON();
          assert.equal(body.expectedListPrice, savedPrice);
          if (!unknown) savedPrice = body.list_price;
          return fulfill({ message: "Response lost", resultState: "unknown" }, 502);
        }
      }
      return fulfill({ code: 0, data: [] });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.on("pageerror", (error) => pageErrors.push(error.message));
    async function check(name, fn) {
      try { await fn(); checks.push({ width, name, status: "PASS" }); }
      catch (error) { checks.push({ width, name, status: "FAIL", error: error.message }); }
    }
    await check("Suggestion tax and net margin labels", async () => {
      await page.goto(`${base}/stock/price-suggestions`, { waitUntil: "domcontentloaded" });
      await page.getByText("Fixture Shiraz", { exact: true }).waitFor();
      await page.getByText("On net sales excluding GST", { exact: true }).waitFor();
      await page.getByText(/Current net.*10.91.*GST.*1.09/).waitFor();
      assert.equal(writeCount, 0);
      await page.screenshot({ path: path.join(screenshotDir, `suggestions-${width}.png`), fullPage: true });
    });
    await check("Suggestion product name hides the R2 marker and preserves the source title", async () => {
      const productName = page.getByText("Fixture Shiraz", { exact: true });
      assert.equal(await productName.textContent(), "Fixture Shiraz");
      assert.equal(await productName.getAttribute("title"), importedFixtureName);
    });
    await check("Suggestion prefill requires manual confirmation", async () => {
      await page.getByRole("link", { name: "Bulk edit this product" }).click();
      await page.getByRole("spinbutton", { name: "Price for Fixture Shiraz" }).waitFor();
      assert.equal(await page.getByRole("spinbutton", { name: "Price for Fixture Shiraz" }).inputValue(), "15.75");
      assert.equal(await page.getByRole("button", { name: "Save reviewed prices" }).isDisabled(), true);
      assert.equal(writeCount, 0); assert.equal(classicCalls, 0);
      const search = page.getByRole("textbox", { name: "Search bulk price products" });
      const searchBox = await search.boundingBox();
      assert.equal(await search.inputValue(), "FIXTURE-SHIRAZ");
      assert.ok(searchBox && searchBox.width >= (width < 500 ? width * 0.85 : 300), `Search width was ${searchBox?.width ?? "unavailable"}px at ${width}px`);
      for (const name of ["Refresh", "Previous", "Next", "Save reviewed prices"]) {
        assert.match(await page.getByRole("button", { name }).getAttribute("class"), /focus-visible:outline/);
      }
      await page.screenshot({ path: path.join(screenshotDir, `bulk-review-${width}.png`), fullPage: true });
    });
    await check("Lost write response reconciles by GET without replay", async () => {
      await page.getByRole("checkbox", { name: "I have reviewed these changes." }).check();
      await page.getByRole("button", { name: "Save reviewed prices" }).click();
      await page.getByText("Requested price confirmed by a fresh Odoo read.").waitFor();
      assert.equal(writeCount, 1); assert.equal(classicCalls, 0);
    });
    await check("A confirmed row can be edited again", async () => {
      await page.getByRole("spinbutton", { name: "Price for Fixture Shiraz" }).fill("16");
      await page.getByRole("heading", { name: "Review 1 price changes" }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Save reviewed prices" }).isDisabled(), true);
    });
    await check("Unconfirmed results block further writes and retain input", async () => {
      unknown = true;
      await page.getByRole("checkbox", { name: "I have reviewed these changes." }).check();
      await page.getByRole("button", { name: "Save reviewed prices" }).click();
      await page.getByText("Result pending confirmation. Check Odoo before making another change.").waitFor();
      assert.equal(await page.getByRole("spinbutton", { name: "Price for Fixture Shiraz" }).inputValue(), "16");
      assert.equal(await page.getByRole("button", { name: "Save reviewed prices" }).isDisabled(), true);
      assert.equal(writeCount, 2);
    });
    await check("No page errors or horizontal overflow", async () => {
      assert.deepEqual(pageErrors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    });
    await context.close();
  }
} finally { await browser.close(); }
const failed = checks.filter((item) => item.status === "FAIL");
const report = { generatedAt: new Date().toISOString(), sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), sourceWorkingTree: true, nodeVersion: process.version, environment: "local-browser-fixtures", target: base, scope: "All browser APIs intercepted; only fixture PATCH/GET; no real business writes", status: failed.length ? "FAIL" : "PASS", passed: checks.length - failed.length, failed: failed.length, checks };
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs/UAT_PRODUCTIZATION_UI_LOCAL_2026-10-21.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
console.log(`${report.passed}/${checks.length} PASS`);
for (const item of failed) console.error(`${item.width} ${item.name}: ${item.error}`);
if (failed.length) process.exitCode = 1;
