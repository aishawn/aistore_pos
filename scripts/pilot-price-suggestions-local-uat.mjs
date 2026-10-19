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
      currentMargin: (12 - 10) / 12,
      suggestedPrice: 14.3,
      suggestedMargin: (14.3 - 10) / 14.3,
      status: "raise",
      reason: "Current margin below target. Suggested GST-inclusive shelf from cost.",
      reasonParts: ["Current margin below target."],
      method: "rules_v1_margin_on_sell",
    },
  ],
};

const browser = await chromium.launch({ headless: true });
const writes = [];
const bulkPriceQueries = [];
const checks = [];
const record = (name, ok, evidence = "") => checks.push({ name, status: ok ? "PASS" : "FAIL", evidence });
const srcRoute = path.join(root, "pos-ui", "src", "app", "stock", "price-suggestions", "page.tsx");
const srcStockHub = path.join(root, "pos-ui", "src", "app", "stock", "more", "page.tsx");
record("production app route wrapper", fs.existsSync(srcRoute), srcRoute);
record(
  "production stock hub links pricing",
  fs.existsSync(srcStockHub) && fs.readFileSync(srcStockHub, "utf8").includes("/stock/price-suggestions"),
  srcStockHub,
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
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
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
  await page.getByText("writeEnabled=false").waitFor({ timeout: 10000 });
  record("price suggestions page", true, "Heading, DEMO row, raise badge, writeEnabled=false visible");

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
  record(
    "bulk edit deep link",
    (await bulkEditLink.getAttribute("href")) === "/stock/bulk-price-edit?search=DEMO-SHIRAZ",
    await bulkEditLink.getAttribute("href") ?? "missing href",
  );
  const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const downloadText = downloadPath ? fs.readFileSync(downloadPath, "utf8") : "";
  record(
    "read-only CSV export",
    download.suggestedFilename().endsWith(".csv") && downloadText.includes("DEMO Shiraz") && downloadText.includes("Suggested price (AUD)"),
    `${download.suggestedFilename()} ${downloadText.slice(0, 180)}`,
  );

  await bulkEditLink.click();
  const bulkSearch = page.getByPlaceholder("Search for Product or Classification...");
  await bulkSearch.waitFor({ state: "visible", timeout: 10000 });
  record("bulk edit pre-fills SKU", await bulkSearch.inputValue() === "DEMO-SHIRAZ", await bulkSearch.inputValue());
  record("bulk edit requests SKU query", bulkPriceQueries.includes("DEMO-SHIRAZ"), JSON.stringify(bulkPriceQueries));
  await page.goto(`${base}/stock/price-suggestions`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: "Price suggestions", exact: true }).waitFor({ timeout: 30000 });

  const fab = page.getByRole("button", { name: "Open Orithos AI" }).first();
  await fab.waitFor({ state: "visible", timeout: 15000 });
  record("ai fab on price page", true);

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
  environment: "local-dev-fixtures",
  target: base,
  scope: "price suggestions read-only UI; APIs intercepted; no Odoo price writes",
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
