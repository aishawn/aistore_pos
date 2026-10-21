/** Stocktake search freshness: real browser, fully intercepted API, no inventory writes. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
if (!new URL(base).hostname.endsWith(".localhost") && new URL(base).hostname !== "localhost") throw new Error("LOCAL_FIXTURE_TARGET_REQUIRED");
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_STOCKTAKE_SEARCH_RACE_LOCAL_CURRENT.json");
const screenshotDir = path.resolve(root, process.env.PILOT_UAT_SCREENSHOT_DIR ?? "docs/screenshots/stocktake-search-race-local");
fs.mkdirSync(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [];
const blockedWrites = [];
const product = (id, name) => ({ id, name, sku: `FIX-${id}`, barcode: `9300000000${id}`, uom: "Units", expectedQty: 5, eligible: true, ineligibleReason: null });
const envelope = (products) => ({ code: 0, data: { locations: [{ id: 7101, name: "Fixture warehouse" }], defaultLocationId: 7101, locationSource: "tenant-binding", writeEnabled: true, products } });

try {
  for (const width of [390, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
    await context.addInitScript(() => localStorage.setItem("sf_user", JSON.stringify({ id: 1, username: "admin", name: "Fixture Admin", isAdmin: true })));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const record = (name, ok, evidence = null) => checks.push({ viewport: width, name, status: ok ? "PASS" : "FAIL", evidence });
    let failNextSearch = false;
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        blockedWrites.push({ method: request.method(), path: url.pathname });
        return route.fulfill({ status: 405, json: { code: 40500, message: "Fixture blocks all writes" } });
      }
      if (url.pathname !== "/api/odoo/stocktake") return route.fulfill({ json: { code: 0, data: [] } });
      const q = url.searchParams.get("q") ?? "";
      if (q === "slow") await new Promise((resolve) => setTimeout(resolve, 900));
      if (q && failNextSearch) {
        failNextSearch = false;
        return route.fulfill({ status: 503, json: { code: 50300, message: "Fixture search unavailable" } });
      }
      return route.fulfill({ json: envelope(!q || q === "empty" ? [] : [product(q === "wine" ? 1 : 2, q === "wine" ? "Fixture wine" : `Fixture ${q}`)]) });
    });
    try {
      await page.goto(`${base}/stock/stocktake`, { waitUntil: "domcontentloaded", timeout: 60000 });
      const search = page.getByLabel("Search or scan a product");
      const list = page.getByRole("listbox", { name: "Stocktake product results" });
      await search.fill("wine");
      await list.getByText("Fixture wine", { exact: true }).waitFor();
      const slowStarted = page.waitForRequest((request) => new URL(request.url()).searchParams.get("q") === "slow");
      const slowFinished = page.waitForResponse((response) => new URL(response.url()).searchParams.get("q") === "slow");
      await search.fill("slow");
      const oldButtons = await list.getByRole("button", { name: "Add to count", exact: true }).count();
      record("old results hidden immediately when query changes", oldButtons === 0, { visibleOldAddButtons: oldButtons });
      record("combobox busy during debounce", await search.getAttribute("aria-busy") === "true");
      record("combobox collapsed while results are unavailable", await search.getAttribute("aria-expanded") === "false");
      await search.press("Enter");
      record("Enter while search is pending cannot add an old product", await page.getByRole("region", { name: "Counted products" }).getByText("0 products", { exact: true }).isVisible());
      await page.screenshot({ path: path.join(screenshotDir, `stocktake-pending-${width}.png`), fullPage: true });
      await slowStarted;
      await search.fill("beer");
      await list.getByText("Fixture beer", { exact: true }).waitFor();
      await slowFinished;
      record("late response cannot replace current search results", await list.getByText("Fixture beer", { exact: true }).isVisible() && await list.getByText("Fixture slow", { exact: true }).count() === 0);
      await list.getByRole("button", { name: "Add to count", exact: true }).click();
      const counted = page.getByRole("region", { name: "Counted products" });
      record("only current product added to local count", await counted.locator(":is(h3,p):visible").filter({ hasText: /^Fixture beer$/ }).count() === 1 && await counted.getByText("Fixture wine", { exact: true }).count() === 0);
      await search.fill("");
      record("cleared query hides results and collapses combobox", await list.count() === 0 && await search.getAttribute("aria-expanded") === "false");
      failNextSearch = true;
      await search.fill("fail");
      await page.getByRole("alert").filter({ hasText: "Fixture search unavailable" }).waitFor();
      record("failed search has no stale selectable products", await list.count() === 0 && await search.getAttribute("aria-expanded") === "false");
      await search.fill("empty");
      record("old search error clears immediately on a new query", await page.getByRole("alert").filter({ hasText: "Fixture search unavailable" }).count() === 0);
      await list.getByText("No matching products.", { exact: true }).waitFor();
      record("empty results shown only after current search completes", await search.getAttribute("aria-busy") === "false" && await search.getAttribute("aria-expanded") === "true");
      await search.fill("wine");
      await search.fill("empty");
      await list.getByText("No matching products.", { exact: true }).waitFor();
      record("returning to the previous term before debounce settles still completes", await search.getAttribute("aria-busy") === "false" && await search.getAttribute("aria-expanded") === "true");
      record("draft preserved across search changes and errors", await counted.getByText("1 product", { exact: true }).isVisible());
      record("no page errors or viewport overflow", errors.length === 0 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), errors);
      await page.screenshot({ path: path.join(screenshotDir, `stocktake-recovered-${width}.png`), fullPage: true });
    } catch (error) {
      record("run", false, error instanceof Error ? error.message : "Unexpected failure");
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
const failed = checks.filter((check) => check.status === "FAIL").length;
const output = { generatedAt: new Date().toISOString(), sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), sourceWorkingTree: true, nodeVersion: process.version, target: base, environment: "local-dev-fixtures", scope: "Search freshness and draft preservation; every API intercepted; no real business writes", status: failed === 0 && blockedWrites.length === 0 ? "PASS" : "FAIL", checks, blockedWrites, screenshotDir: path.relative(root, screenshotDir).replaceAll(path.sep, "/") };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, failed }));
if (output.status !== "PASS") process.exitCode = 1;
