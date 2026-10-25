import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3100";
const targetUrl = new URL(base);
const mappedTenantHost = targetUrl.hostname === "demo.orithos.com.au" && ["3100", "3101"].includes(targetUrl.port);
if (!mappedTenantHost && !/^(localhost|127\.0\.0\.1|[\w-]+\.localhost)$/.test(targetUrl.hostname)) {
  throw new Error("This POS product-search fixture is local-only.");
}
const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sourceTreeDirty = Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim());

const screenshotDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR ?? "docs/screenshots/2026-10-24-pos-search-race");
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_POS_PRODUCT_SEARCH_LOCAL_2026-10-24.json");
fs.mkdirSync(screenshotDir, { recursive: true });
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const user = { id: "fixture-user", username: "pos-search-fixture", name: "POS Search Fixture", isAdmin: true, vendorId: 41, outletId: 1 };
const writes = [];
const calls = [];
const checks = [];
let releaseSlowSearch;
let slowSearchStarted;
const slowStarted = new Promise((resolve) => { slowSearchStarted = resolve; });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-proxy-server", ...(mappedTenantHost ? ["--host-resolver-rules=MAP demo.orithos.com.au 127.0.0.1"] : [])],
});

function product(id, name) {
  return {
    id,
    name,
    display_name: name,
    barcode: false,
    default_code: false,
    list_price: 12.5,
    taxes_id: [1],
    price_included: 12.5,
    price_tax: 1.14,
    qty_available: 8,
    free_qty: 8,
    uom_id: [1, "Units"],
    pos_categ_ids: [1],
    available_in_pos: true,
  };
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addCookies([{ name: "orithos_access_token", value: "pos-search-fixture", url: base }]);
  await context.addInitScript((fixtureUser) => {
    localStorage.setItem("sf_token", "pos-search-fixture");
    localStorage.setItem("sf_user", JSON.stringify(fixtureUser));
  }, user);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const fulfill = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (url.pathname === "/api/auth/me" && method === "GET") return fulfill({ code: 0, data: user });
    if (url.pathname === "/api/odoo/session" && method === "GET") return fulfill({ user: { id: "fixture-odoo-user", name: "Fixture Odoo User" }, autoRecoverConfigured: false });
    if (url.pathname === "/api/odoo/pos-bootstrap" && method === "GET") {
      return fulfill({
        activeSessionId: 5,
        configs: [{
          id: 3,
          name: "Fixture Register",
          company: [41, "Fixture Store"],
          timezone: "Australia/Adelaide",
          session: { id: 5, name: "Fixture Session", state: "opened", config_id: [3, "Fixture Register"], user_id: [1, "Fixture User"], start_at: "2026-10-24T09:00:00Z", cashBalanceStart: 100, cashBalanceEnd: null },
          paymentMethods: [{ id: 2, name: "Cash", type: "cash", is_cash_count: true }],
          pricelistIds: [], cashRounding: null, onlyRoundCashMethod: false,
        }],
      });
    }
    if (url.pathname === "/api/odoo/records" && method === "POST") {
      const body = request.postDataJSON();
      if (body.type === "posCategories") return fulfill({ items: [{ id: 1, name: "Fixture Category", parent_id: false }], limit: body.limit ?? 100, offset: 0, hasNext: false });
      if (body.type === "products") {
        calls.push({ query: body.query ?? "", at: Date.now() });
        if (body.query === "slow-result") {
          slowSearchStarted();
          await new Promise((resolve) => { releaseSlowSearch = resolve; });
          return fulfill({ items: [product(12, "Stale Slow Result")], limit: 50, offset: 0, hasNext: false });
        }
        const items = body.query === "latest-result"
          ? [product(13, "Latest Search Result")]
          : body.query === "rapid-final"
            ? [product(14, "Rapid Final Result")]
            : [product(11, "Initial Fixture Product")];
        return fulfill({ items, limit: 50, offset: 0, hasNext: false });
      }
      return fulfill({ items: [], limit: body.limit ?? 50, offset: body.offset ?? 0, hasNext: false });
    }

    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      writes.push(`${method} ${url.pathname}`);
      return fulfill({ message: "Fixture blocked unexpected write" }, 405);
    }
    return fulfill({ items: [] });
  });

  await page.goto(`${base}/register/odoo`, { waitUntil: "domcontentloaded", timeout: 45000 });
  const search = page.getByRole("combobox", { name: "Search products by name, barcode or code" });
  await search.waitFor({ state: "visible" });
  const headerAssistant = page.getByRole("button", { name: "Open Orithos AI assistant" });
  const headerAssistantCount = await headerAssistant.count();
  const headerAssistantY = headerAssistantCount ? (await headerAssistant.first().boundingBox())?.y ?? null : null;
  checks.push({
    id: "header-ai-placement",
    status: headerAssistantCount === 1 && headerAssistantY !== null && headerAssistantY < 100 ? "PASS" : "FAIL",
    visibleEntries: headerAssistantCount,
    y: headerAssistantY,
  });
  await page.waitForTimeout(800);
  if (await page.getByRole("option", { name: /Initial Fixture Product/ }).count() === 0) {
    throw new Error(`Initial product fixture did not render. URL=${page.url()} API calls=${JSON.stringify(calls)} page=${(await page.locator("body").innerText()).slice(0, 500)}`);
  }
  checks.push({ id: "register-loaded", status: "PASS" });

  await search.fill("rapid");
  assert.equal(await search.inputValue(), "rapid", "search text should update synchronously");
  await search.fill("rapid-final");
  assert.equal(await search.inputValue(), "rapid-final", "latest input should remain visible");
  await page.getByRole("option", { name: /Rapid Final Result/ }).waitFor();
  assert.equal(calls.filter((call) => call.query === "rapid-final").length, 1);
  assert.equal(calls.some((call) => call.query === "rapid"), false, "debounce should suppress the superseded query");
  checks.push({ id: "immediate-input-and-debounce", status: "PASS" });

  await search.fill("slow-result");
  assert.equal(await page.getByRole("option", { name: /Rapid Final Result/ }).count(), 0, "old results must disappear synchronously on input");
  await slowStarted;
  await search.fill("latest-result");
  await page.getByRole("option", { name: /Latest Search Result/ }).waitFor();
  releaseSlowSearch?.();
  await page.waitForTimeout(100);
  assert.equal(await page.getByRole("option", { name: /Stale Slow Result/ }).count(), 0, "late stale response must not replace the latest results");
  assert.equal(await page.getByRole("option", { name: /Latest Search Result/ }).count(), 1);
  checks.push({ id: "stale-response-race", status: "PASS" });

  await search.fill("clear-me");
  assert.equal(await page.getByRole("option", { name: /Latest Search Result/ }).count(), 0, "old results must be removed before debounce");
  await search.fill("");
  assert.equal(await search.inputValue(), "", "clear action should immediately clear the input");
  assert.equal(await page.getByRole("option", { name: /Latest Search Result/ }).count(), 0, "clearing must immediately remove previous results");
  await page.getByRole("option", { name: /Initial Fixture Product/ }).waitFor();
  checks.push({ id: "clear-and-default-catalog", status: "PASS" });

  const viewportResults = [];
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(80);
    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      resultCount: document.querySelectorAll("[role='option']").length,
      floatingAssistantCount: [...document.querySelectorAll("button")].filter((button) => {
        const rect = button.getBoundingClientRect();
        let parent = button.parentElement;
        while (parent && getComputedStyle(parent).position !== "fixed") parent = parent.parentElement;
        return Boolean(parent) && rect.top > 100 && rect.bottom >= window.innerHeight - 100;
      }).length,
    }));
    assert.equal(dimensions.documentWidth <= dimensions.viewportWidth, true, `horizontal overflow at ${width}px`);
    assert.equal(dimensions.resultCount, 1, `fixture result should remain visible at ${width}px`);
    viewportResults.push({ width, ...dimensions, horizontalOverflow: false });
    await page.screenshot({ path: path.join(screenshotDir, `pos-search-${width}.png`), fullPage: true });
  }
  const responsivePass = viewportResults.every((result) => result.documentWidth <= result.viewportWidth && result.resultCount === 1 && result.floatingAssistantCount === 0);
  checks.push({
    id: "responsive-viewports",
    status: responsivePass ? "PASS" : "FAIL",
    viewports: viewportResults.map(({ width }) => width),
    floatingLauncherVisible: viewportResults.some((result) => result.floatingAssistantCount > 0),
  });

  assert.deepEqual(writes, [], "fixture must block all business writes");
  assert.deepEqual(pageErrors, [], "page should have no browser errors");
  checks.push({ id: "no-business-writes-or-page-errors", status: "PASS" });
  assert.deepEqual(checks.filter((check) => check.status === "FAIL"), [], "one or more browser acceptance checks failed");

  const report = {
    generatedAt: new Date().toISOString(),
    status: "PASS",
    source: "local Playwright fixture; all API calls intercepted",
    nodeVersion: process.version,
    sourceHead,
    sourceTreeDirty,
    target: `${new URL(base).origin}/register/odoo`,
    checks,
    productSearchQueries: calls.map(({ query }) => query),
    businessWrites: writes,
    pageErrors,
    screenshots: path.relative(root, screenshotDir).replaceAll("\\", "/"),
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  await context.close();
} catch (error) {
  releaseSlowSearch?.();
  const report = {
    generatedAt: new Date().toISOString(),
    status: "FAIL",
    source: "local Playwright fixture; all API calls intercepted when page load succeeds",
    nodeVersion: process.version,
    sourceHead,
    sourceTreeDirty,
    target: `${targetUrl.origin}/register/odoo`,
    checks,
    failure: error instanceof Error ? error.message.slice(0, 700) : "Unknown browser fixture failure",
    productSearchQueries: calls.map(({ query }) => query),
    businessWrites: writes,
    screenshots: path.relative(root, screenshotDir).replaceAll("\\", "/"),
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
