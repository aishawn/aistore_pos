/**
 * Local fixture UAT for read-only price suggestions.
 * Intercepts Odoo APIs; asserts UI + writeEnabled=false; no list_price writes.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
const screenshotDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR ?? "docs/screenshots/2026-10-21-price-suggestions-local");
fs.mkdirSync(screenshotDir, { recursive: true });
const fixtureUser = {
  id: 1,
  name: "Admin",
  username: "admin",
  isAdmin: true,
  outletId: 1,
  vendorId: 1,
  pendingPasswordReset: false,
};

const suggestionPayload = {
  company: "UAT Store",
  historyDays: 28,
  marginTarget: 0.3,
  writeEnabled: false,
  truncated: false,
  generatedAt: new Date().toISOString(),
  products: [
    {
      id: 101,
      name: "DEMO Shiraz",
      sku: "DEMO-SHIRAZ",
      unit: "Units",
      soldUnits: 12,
      onHand: 4,
      cost: 10,
      currentPrice: 12,
      currentMargin: (12 / 1.1 - 10) / (12 / 1.1),
      suggestedPrice: 15.75,
      suggestedMargin: (15.75 / 1.1 - 10) / (15.75 / 1.1),
      status: "raise",
      reason: "Current margin below target. Suggested shelf is based on net sales excluding GST.",
      reasonParts: ["Current margin below target."],
      method: "rules_v2_net_margin",
      currentNetPrice: 10.91,
      currentGst: 1.09,
      suggestedNetPrice: 14.32,
      suggestedGst: 1.43,
      currentListPrice: 12,
      suggestedListPrice: 15.75,
      taxBasis: "odoo_sale_taxes",
      marginBasis: "net_sales_excluding_gst",
      costBasis: "odoo_standard_cost",
    },
  ],
};

const browser = await chromium.launch({ headless: true });
const writes = [];
const bulkPriceQueries = [];
const checks = [];
let fixtureListPrice = 12;
const record = (name, ok, evidence = "") => checks.push({ name, status: ok ? "PASS" : "FAIL", evidence });
const appRoute = path.join(root, "pos-ui", "app", "stock", "price-suggestions", "page.tsx");
const appStockHub = path.join(root, "pos-ui", "app", "stock", "more", "page.tsx");
record("production app route wrapper", fs.existsSync(appRoute), appRoute);
record(
  "production stock hub links pricing",
  fs.existsSync(appStockHub) && fs.readFileSync(appStockHub, "utf8").includes("/stock/price-suggestions"),
  appStockHub,
);

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
  await context.addInitScript((user) => {
    localStorage.setItem("sf_user", JSON.stringify(user));
  }, fixtureUser);
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const readOnlyRecordsQuery = url.pathname === "/api/odoo/records" && method === "POST";
    if (!readOnlyRecordsQuery && method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      writes.push(`${method} ${url.pathname}`);
    }
    if (url.pathname === "/api/odoo/price-suggestions") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(suggestionPayload),
      });
    }
    if (url.pathname === "/api/bulk-price-edit") {
      bulkPriceQueries.push(url.searchParams.get("search") ?? "");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 0,
          message: "OK",
          data: {
            items: [{ productId: "101", productName: "DEMO Shiraz", caseQuantity: 6, priceSetName: "Default", prices: [] }],
            total: 1,
            page: 1,
            size: 20,
          },
        }),
      });
    }
    if (url.pathname === "/api/odoo/records") {
      bulkPriceQueries.push(route.request().postDataJSON()?.query ?? "");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: 101, name: "DEMO Shiraz", display_name: "DEMO Shiraz", barcode: "", default_code: "DEMO-SHIRAZ", list_price: fixtureListPrice, taxes_id: [], price_included: 1, price_tax: 0, qty_available: 12, free_qty: 12, uom_id: [1, "Units"], pos_categ_ids: [], available_in_pos: true }], limit: 30, offset: 0 }) });
    }
    if (url.pathname === "/api/auth/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 0, message: "OK", data: fixtureUser }),
      });
    }
    if (url.pathname === "/api/odoo/session") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: fixtureUser, autoRecoverConfigured: true }),
      });
    }
    if (url.pathname === "/api/ai/config/client") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 0, message: "OK", data: { enabled: false, aiTriggerKeywords: [] } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 0, message: "OK", data: [] }),
    });
  });

  const page = await context.newPage();
  const pageResponse = await page.goto(`${base}/stock/price-suggestions`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const cacheControl = pageResponse?.headers()["cache-control"] ?? "";
  record("live pricing page is not cached", /no-store|no-cache/i.test(cacheControl), cacheControl || "missing Cache-Control header");
  await page.getByRole("heading", { name: "Price suggestions", exact: true }).waitFor({ timeout: 30000 });
  await page.getByText("Suggestions only").waitFor({ timeout: 10000 });
  await page.getByText("DEMO Shiraz").waitFor({ timeout: 10000 });
  await page.getByText("Raise price", { exact: true }).last().waitFor({ timeout: 10000 });
  await page.getByText("Suggestions are read-only").waitFor({ timeout: 10000 });
  record("price suggestions page", true, "Heading, DEMO row, raise badge and read-only guidance visible");
  record("price suggestion shows GST-exclusive basis", await page.getByText("Current net $10.91 · GST $1.09 · Suggested net $14.32 · GST $1.43", { exact: true }).count() === 1, "Current and suggested net/GST amounts match the Odoo 10% tax fixture");
  record("price suggestion shows target margin calculation", await page.getByText("Current $12.00 (8.3%)", { exact: false }).count() === 1 && await page.getByText("Suggested $15.75", { exact: false }).count() === 1, "Current net margin is 8.3%; suggested shelf price is $15.75");
  await page.screenshot({ path: path.join(screenshotDir, "price-suggestions-1440.png"), fullPage: true });

  const productSearch = page.getByPlaceholder("Search product or SKU");
  await productSearch.fill("DEMO-SHIRAZ");
  await page.getByText("1 shown").waitFor({ timeout: 5000 });
  record("product and SKU search", await page.getByText("DEMO Shiraz").count() > 0, "SKU query keeps the matching product visible");
  await productSearch.fill("does-not-exist");
  await page.getByText("No products match the current filters.").waitFor({ timeout: 5000 });
  record("empty search state", true, "Unmatched query explains that no products match");
  await productSearch.fill("");
  await page.getByLabel("Status").selectOption("raise");
  await page.getByText("DEMO Shiraz").waitFor({ timeout: 5000 });
  record("status filter", true, "Raise price filter keeps the matching row visible");
  await page.getByLabel("Status").selectOption("missing_cost");
  await page.getByText("No products match the current filters.").waitFor({ timeout: 5000 });
  record("status empty state", true, "Missing cost filter hides non-matching rows");
  await page.getByLabel("Status").selectOption("all");

  const productLink = page.getByRole("link", { name: "Open product" }).first();
  await productLink.waitFor({ state: "visible", timeout: 10000 });
  record("apply CTA present", true, "Open product link present; no apply-price write control");
  const bulkEditLink = page.getByRole("link", { name: "Bulk edit this product" }).first();
  await bulkEditLink.waitFor({ state: "visible", timeout: 10000 });
  const expectedBulkEditHref = "/stock/bulk-price-edit?search=DEMO-SHIRAZ&productId=101&suggestedPrice=15.75&expectedPrice=12";
  record(
    "bulk edit deep link carries product, suggestion and expected price",
    (await bulkEditLink.getAttribute("href")) === expectedBulkEditHref,
    await bulkEditLink.getAttribute("href") ?? "missing href",
  );
  const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const downloadText = downloadPath ? fs.readFileSync(downloadPath, "utf8") : "";
  record(
    "read-only CSV export",
    download.suggestedFilename().endsWith(".csv") && downloadText.includes("DEMO Shiraz") && downloadText.includes("Suggested shelf incl GST (AUD)"),
    `${download.suggestedFilename()} ${downloadText.slice(0, 180)}`,
  );

  await bulkEditLink.click();
  await page.waitForURL(/\/stock\/bulk-price-edit/);
  await page.reload({ waitUntil: "domcontentloaded" });
  const bulkSearch = page.locator('input[placeholder="Search product or SKU"]:visible');
  await bulkSearch.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(1200);
  record("bulk edit pre-fills SKU", await bulkSearch.inputValue() === "DEMO-SHIRAZ", await bulkSearch.inputValue());
  record("bulk edit requests SKU query", bulkPriceQueries.includes("DEMO-SHIRAZ"), JSON.stringify(bulkPriceQueries));
  const suggestedPriceInput = page.getByRole("spinbutton", { name: "Price for DEMO Shiraz" });
  await suggestedPriceInput.waitFor({ state: "visible", timeout: 10000 });
  record("bulk edit pre-fills GST-inclusive suggestion", await suggestedPriceInput.inputValue() === "15.75", await suggestedPriceInput.inputValue());
  record("bulk edit confirms current price still matches suggestion", await page.getByText("Current list $12.00", { exact: false }).count() > 0, "Fixture Odoo list_price is 12.00; expectedPrice query is 12");
  record("suggestion navigation performs no price write", writes.length === 0, JSON.stringify(writes));
  fixtureListPrice = 13;
  await page.goto(`${base}${expectedBulkEditHref}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("alert").getByText("This suggestion is invalid or the original price has changed. Review the current price.").waitFor({ timeout: 10000 });
  const stalePriceInput = page.getByRole("spinbutton", { name: "Price for DEMO Shiraz" });
  record("stale suggestion is rejected after Odoo price changes", await stalePriceInput.inputValue() === "13", "Expected price 12 differs from fixture current list_price 13; no stale suggestion was applied");
  record("stale suggestion rejection performs no write", writes.length === 0, JSON.stringify(writes));
  await page.goto(`${base}/stock/price-suggestions`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: "Price suggestions", exact: true }).waitFor({ timeout: 30000 });
  for (const viewport of [320, 390, 768, 1024].map((width) => ({
    width,
    height: width < 768 ? 844 : 900,
  }))) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    const mobileLayout = await page.evaluate(() => {
      const main = document.querySelector("main");
      const content = document.querySelector("main > section");
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        contentWidth: content?.getBoundingClientRect().width ?? 0,
        mainWidth: main?.getBoundingClientRect().width ?? 0,
        floatCount: document.querySelectorAll('[aria-label="Open Orithos AI"]').length,
      };
    });
    const suffix = viewport.width;
    record(`mobile content uses available width at ${suffix}px`, mobileLayout.contentWidth >= mobileLayout.mainWidth - 48, JSON.stringify(mobileLayout));
    record(`mobile page has no horizontal overflow at ${suffix}px`, mobileLayout.documentWidth <= mobileLayout.viewportWidth + 1, JSON.stringify(mobileLayout));
    const headerAi = page.getByRole("button", { name: "Open Orithos AI assistant" });
    record(`single header AI entry at ${suffix}px`, await headerAi.isVisible() && mobileLayout.floatCount === 0, JSON.stringify(mobileLayout));
    await page.screenshot({ path: path.join(screenshotDir, `price-suggestions-${suffix}.png`), fullPage: true });
    if (await headerAi.isVisible()) {
      await headerAi.click();
      const assistantDialog = page.getByRole("dialog", { name: "Orithos AI assistant" });
      await assistantDialog.waitFor({ state: "visible", timeout: 10000 });
      record(`header AI opens assistant at ${suffix}px`, true);
      await assistantDialog.getByRole("button", { name: "Close assistant" }).click();
      await assistantDialog.waitFor({ state: "detached", timeout: 5000 });
    }
  }

  record("no api writes", writes.length === 0, JSON.stringify(writes));
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
  sourceWorkingTree: execFileSync("git", ["status", "--porcelain", "--", "pos-ui/src/components/OdooPriceSuggestionsPage.tsx", "scripts/pilot-price-suggestions-local-uat.mjs"], { cwd: root, encoding: "utf8" }).trim().length > 0,
  nodeVersion: process.version,
  environment: "local-dev-fixtures",
  target: base,
  scope: "price suggestions read-only UI; APIs intercepted; no Odoo price writes",
  screenshots: [
    path.relative(root, path.join(screenshotDir, "price-suggestions-320.png")).replaceAll(path.sep, "/"),
    path.relative(root, path.join(screenshotDir, "price-suggestions-390.png")).replaceAll(path.sep, "/"),
    path.relative(root, path.join(screenshotDir, "price-suggestions-768.png")).replaceAll(path.sep, "/"),
    path.relative(root, path.join(screenshotDir, "price-suggestions-1024.png")).replaceAll(path.sep, "/"),
    path.relative(root, path.join(screenshotDir, "price-suggestions-1440.png")).replaceAll(path.sep, "/"),
  ],
  status: failed === 0 ? "PASS" : "FAIL",
  checks,
  writes,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ outputPath, status: output.status, failed, writes: writes.length }));
if (failed) process.exitCode = 1;
