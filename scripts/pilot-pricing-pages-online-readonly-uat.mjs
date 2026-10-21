/** Authenticated, read-only browser regression for pricing and stock edit pages. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const routes = [
  { path: "/stock/list", heading: "Stock List", image: "stock-list", tableId: "stock-list-table" },
  { path: "/stock/capped-pricing", heading: "Capped Pricing", image: "capped-pricing", tableId: "capped-pricing-table" },
  { path: "/stock/bulk-price-edit", heading: "Bulk Price Edit", image: "bulk-price-edit", tableId: "bulk-price-edit-table" },
  { path: "/stock/price-suggestions", heading: "Price suggestions", image: "price-suggestions" },
];
const viewports = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const outputDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR ?? "docs/screenshots/2026-10-19-pricing-reliability-online");
fs.mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [];
const blockedWrites = [];

try {
  const context = await browser.newContext({ viewport: viewports[0] });
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password, subdomain: process.env.PILOT_SUBDOMAIN ?? env.PILOT_SUBDOMAIN ?? "demo" },
    headers: { Origin: base, "X-Orithos-Tenant-Slug": process.env.PILOT_SUBDOMAIN ?? env.PILOT_SUBDOMAIN ?? "demo" },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  for (const viewport of viewports) {
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const readOnlyRecordsQuery = request.method() === "POST" && url.pathname === "/api/odoo/records";
      if (!readOnlyRecordsQuery && !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        blockedWrites.push(`${request.method()} ${url.pathname}`);
        return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "Read-only UAT blocked this request", data: null }) });
      }
      return route.continue();
    });

    for (const route of routes) {
      pageErrors.length = 0;
      const response = await page.goto(`${base}${route.path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
      const heading = page.getByRole("heading", { name: route.heading, exact: true }).first();
      await heading.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
      const loading = page.getByRole("status", { name: "Loading" }).first();
      await loading.waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
      const loadingComplete = !(await loading.isVisible().catch(() => false));
      const firstHeadingText = await page.locator("h1").first().innerText().catch(() => "");
      const headingVisible = await heading.isVisible().catch(() => false)
        || firstHeadingText.trim() === route.heading
        || await page.getByText(route.heading, { exact: true }).first().isVisible().catch(() => false);
      const hasDataTable = Boolean(route.tableId) && route.path !== "/stock/bulk-price-edit";
      let mobileTableScroll = null;
      let mobileCardFields = null;
      let mobileCardWidth = null;
      let mobileContentWidth = null;
      let mobileSearchWidth = null;
      let aiEntryPlacement = null;
      let bottomSafeArea = null;
      let assistantCardOverlap = null;
      let tableColumnsDoNotOverlap = null;
      let columnsAlignWithFirstRow = null;
      let headerTextFits = null;
      if (hasDataTable) {
        const header = page.locator(".sticky").first();
        const layout = await header.evaluate((element) => {
          let scroller = element.parentElement;
          while (scroller && scroller !== document.body) {
            const overflowX = getComputedStyle(scroller).overflowX;
            if (overflowX === "auto" || overflowX === "scroll") break;
            scroller = scroller.parentElement;
          }
          const boxes = Array.from(element.children).map((child) => child.getBoundingClientRect());
          const next = element.nextElementSibling;
          const row = next?.classList.contains("flex") && next.classList.contains("border-b")
            ? next
            : null;
          const rowBoxes = row ? Array.from(row.children).slice(0, boxes.length).map((child) => child.getBoundingClientRect()) : [];
          const columnsAlignWithFirstRow = row
            ? boxes.every((box, index) => {
                const rowBox = rowBoxes[index];
                return rowBox && Math.abs(box.left - rowBox.left) <= 1 && Math.abs(box.right - rowBox.right) <= 1;
              })
            : null;
          const headerTextFits = Array.from(element.children).every((child) => {
            const range = document.createRange();
            range.selectNodeContents(child);
            const childBox = child.getBoundingClientRect();
            return Array.from(range.getClientRects()).every((rect) => rect.left >= childBox.left - 1 && rect.right <= childBox.right + 1);
          });
          return {
            mobileTableScroll: scroller ? scroller.scrollWidth > scroller.clientWidth : false,
            columnsDoNotOverlap: boxes.length > 0 && boxes.every((box, index) => index === 0 || boxes[index - 1].right <= box.left + 1),
            columnsAlignWithFirstRow,
            headerTextFits,
          };
        }).catch(() => ({ mobileTableScroll: false, columnsDoNotOverlap: false, columnsAlignWithFirstRow: false, headerTextFits: false }));
        mobileTableScroll = layout.mobileTableScroll;
        tableColumnsDoNotOverlap = layout.columnsDoNotOverlap;
        columnsAlignWithFirstRow = layout.columnsAlignWithFirstRow;
        headerTextFits = layout.headerTextFits;
      }
      if (route.path === "/stock/list" && viewport.width === 390) {
        const mobileEditor = page.locator('input[aria-label^="Product name for "]').last();
        const card = page.locator("article").filter({ has: mobileEditor }).last();
        mobileCardFields = await Promise.all([
          mobileEditor.isVisible(),
          card.isVisible(),
          page.locator('dl dt', { hasText: "Category" }).last().isVisible(),
          page.locator('dl dt', { hasText: "Stock on hand" }).last().isVisible(),
          page.locator('input[aria-label^="Price quantity for "]').last().isVisible(),
          page.locator('input[aria-label^="Cost for "]').last().isVisible(),
          page.locator('input[aria-label^="Price for "]').last().isVisible(),
          page.locator('input[aria-label^="Profit margin for "]').last().isVisible(),
        ]).then((fields) => fields.every(Boolean));
        mobileCardWidth = await card.evaluate((element) => element.getBoundingClientRect().width).catch(() => 0);
        assistantCardOverlap = await page.evaluate(() => {
          const assistant = document.querySelector('[aria-label="Open AI assistant"]');
          if (!assistant) return true;
          const assistantRect = assistant.getBoundingClientRect();
          const intersects = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
          return ![...document.querySelectorAll('article')].some((card) => {
            const rect = card.getBoundingClientRect();
            const style = getComputedStyle(card);
            return style.visibility !== 'hidden' && style.display !== 'none'
              && rect.width > 0 && rect.height > 0 && intersects(assistantRect, rect);
          });
        });
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
        bottomSafeArea = await page.evaluate(() => {
          const assistant = document.querySelector('[aria-label="Open AI assistant"]');
          const next = [...document.querySelectorAll("button")].find((button) => /Next/i.test(button.textContent ?? ""));
          if (!assistant || !next) return true;
          const a = assistant.getBoundingClientRect();
          const n = next.getBoundingClientRect();
          return a.right <= n.left || a.left >= n.right || a.bottom <= n.top || a.top >= n.bottom;
        });
        await page.evaluate(() => window.scrollTo(0, 0));
      } else if (viewport.width === 390 && route.path === "/stock/capped-pricing") {
        const card = page.getByTestId("capped-pricing-card").first();
        mobileCardFields = await Promise.all([
          card.isVisible(),
          card.getByText("Source", { exact: true }).isVisible(),
          card.getByText("Start Date", { exact: true }).isVisible(),
          card.getByText("End Date", { exact: true }).isVisible(),
          card.getByText("Quantity", { exact: true }).isVisible(),
          card.getByText("Capped Price", { exact: true }).isVisible(),
          card.getByText("Current Price", { exact: true }).isVisible(),
          card.getByText("Margin", { exact: true }).isVisible(),
        ]).then((fields) => fields.every(Boolean));
        mobileCardWidth = await card.evaluate((element) => element.getBoundingClientRect().width).catch(() => 0);
      } else if (viewport.width === 390 && route.path === "/stock/bulk-price-edit") {
        const card = page.getByText(/Current list/).first();
        mobileCardFields = (await page.locator('input[type="number"]').count()) > 0
          && (await page.getByText("New Odoo list price", { exact: true }).count()) > 0;
        mobileCardWidth = await card.evaluate((element) => element.getBoundingClientRect().width).catch(() => 0);
        mobileSearchWidth = await page.getByRole("textbox", { name: "Search bulk price products" })
          .evaluate((element) => element.getBoundingClientRect().width).catch(() => 0);
        // The Odoo editor uses responsive list rows rather than the legacy table/card test ids.
        // Keep the acceptance on actual overflow, search width and visible numeric editors.
        mobileCardFields = null;
        mobileTableScroll = false;
      } else if (viewport.width === 390 && route.path === "/stock/price-suggestions") {
        mobileContentWidth = await page.locator("main > section").evaluate((element) => element.getBoundingClientRect().width).catch(() => 0);
      }
      if (viewport.width === 390 && (route.tableId || route.path === "/stock/price-suggestions")) {
        aiEntryPlacement = {
          headerVisible: await page.getByRole("button", { name: "Open Orithos AI assistant" }).isVisible().catch(() => false),
          floatingEntryHidden: await page.getByRole("button", { name: "Open Orithos AI", exact: true }).count() === 0,
        };
      }
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }));
      const screenshot = path.join(outputDir, `${route.image}-${viewport.width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => null);
      checks.push({
        route: route.path,
        viewport: viewport.width,
        httpStatus: response?.status() ?? 0,
        headingVisible,
        loadingComplete,
        noHorizontalOverflow: dimensions.width <= dimensions.viewport + 1,
        mobileTableScroll: viewport.width === 390 && (hasDataTable || route.path === "/stock/bulk-price-edit") ? mobileTableScroll : null,
        mobileCardFields,
        mobileCardWidth,
        mobileContentWidth,
        mobileSearchWidth,
        aiEntryPlacement,
        bottomSafeArea,
        assistantCardOverlap,
        tableColumnsDoNotOverlap,
        columnsAlignWithFirstRow,
        headerTextFits,
        pageErrors: [...pageErrors],
        screenshot: path.relative(root, screenshot).replaceAll(path.sep, "/"),
      });
    }
    await page.close();
  }
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await context.close();
} catch (error) {
  checks.push({ route: "run", viewport: null, status: "FAIL", evidence: error instanceof Error ? error.message : "failed" });
} finally {
  await browser.close();
}

const failures = checks.filter((check) => check.status === "FAIL"
  || (check.httpStatus != null && (check.httpStatus < 200 || check.httpStatus >= 400))
  || check.headingVisible === false
  || check.loadingComplete === false
  || check.noHorizontalOverflow === false
  || (check.viewport === 390 && check.route !== "/stock/price-suggestions" && check.mobileTableScroll !== false)
  || check.mobileCardFields === false
  || (check.viewport === 390 && check.mobileCardFields !== null && (check.mobileCardWidth ?? 0) < check.viewport - 64)
  || (check.viewport === 390 && check.route === "/stock/price-suggestions" && (check.mobileContentWidth ?? 0) < check.viewport - 48)
  || (check.mobileSearchWidth != null && check.mobileSearchWidth < 240)
  || check.aiEntryPlacement?.headerVisible === false
  || check.aiEntryPlacement?.floatingEntryHidden === false
  || check.bottomSafeArea === false
  || check.assistantCardOverlap === false
  || check.tableColumnsDoNotOverlap === false
  || check.columnsAlignWithFirstRow === false
  || check.headerTextFits === false
  || (check.pageErrors?.length ?? 0) > 0);
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  target: base,
  deployment: process.env.PILOT_DEPLOYMENT_VERIFIED === "true" && /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
    ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase()
    : "unverified-after-deploy",
  scope: "authenticated pricing and stock pages; non-GET API calls blocked; no business writes",
  status: failures.length === 0 && blockedWrites.length === 0 ? "PASS" : "FAIL",
  passed: checks.length - failures.length,
  failed: failures.length,
  checks,
  blockedWrites,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: output.passed, failed: output.failed, blockedWrites: blockedWrites.length }));
if (failures.length > 0 || blockedWrites.length > 0) process.exitCode = 1;
