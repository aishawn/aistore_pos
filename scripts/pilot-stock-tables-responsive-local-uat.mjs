/** Fixture UAT for Stock List and Capped Pricing table layout at mobile/desktop widths. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
const fixtureUser = { id: 1, name: "Admin", username: "admin", isAdmin: true, outletId: 1, vendorId: 1, pendingPasswordReset: false };
const pageData = (items) => ({ code: 0, message: "ok", data: { items, total: items.length, page: 1, size: 20 } });
const routes = [
  { path: "/stock/list", heading: "Stock List", api: "/api/stock-list", testId: "stock-list-table", screenshot: "stock-list" },
  { path: "/stock/capped-pricing", heading: "Capped Pricing", api: "/api/capped-pricing", testId: "capped-pricing-table", screenshot: "capped-pricing" },
  { path: "/stock/bulk-price-edit", heading: "Bulk Price Edit", api: "/api/bulk-price-edit", testId: "bulk-price-edit-table", screenshot: "bulk-price-edit" },
];
const viewports = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const outputDir = process.env.PILOT_SCREENSHOT_DIR
  ? path.resolve(root, process.env.PILOT_SCREENSHOT_DIR)
  : path.join(root, "docs", "screenshots", "2026-10-19-stock-tables-local");
fs.mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [];
const blockedWrites = [];
const requests = [];
let activeRoute = "";

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name: "orithos_access_token", value: "local-layout-uat", url: base }]);
    await context.addInitScript((user) => {
      localStorage.setItem("sf_token", "local-layout-uat");
      localStorage.setItem("sf_user", JSON.stringify(user));
    }, fixtureUser);
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      requests.push(`${request.method()} ${url.pathname}`);
      if (request.method() !== "GET") {
        blockedWrites.push(`${request.method()} ${url.pathname}`);
        return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "Fixture blocked writes", data: null }) });
      }
      if (url.pathname === "/api/auth/me") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "ok", data: fixtureUser }) });
      }
      if (url.pathname === "/api/classifications/category") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "ok", data: [] }) });
      }
      if (url.pathname === "/api/ai/config/client") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "ok", data: { enabled: false, aiTriggerKeywords: [] } }) });
      }
      if (url.pathname === "/api/stock-list") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pageData([{ id: "p1", name: "DEMO Shiraz", categoryName: "Wine", priceSetName: "Default", caseQuantity: 6, casesOnHand: 2, itemsOnHand: 4, priceQuantity: 1, priceId: "price-1", cost: 10, price: 14 }])) });
      }
      if (url.pathname === "/api/capped-pricing") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pageData([{ id: "c1", productId: "p1", priceId: "price-1", productName: "DEMO Shiraz", priceSetName: "Default", source: "Supplier", sourceType: "PROVIDED", startDate: "2026-01-01", endDate: "2026-12-31", quantity: 1, cappedPrice: 16, currentPrice: 14, cost: 10 }])) });
      }
      if (url.pathname === "/api/bulk-price-edit") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pageData([{ productId: "p1", productName: "DEMO Shiraz", caseQuantity: 6, priceSetName: "Default", prices: [{ quantity: 1, priceId: "price-1", price: 14 }] }])) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "ok", data: [] }) });
    });

    for (const route of routes) {
      activeRoute = `${route.path} ${viewport.width}`;
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      const response = await page.goto(`${base}${route.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      const heading = page.getByRole("heading", { name: route.heading, exact: true });
      await heading.waitFor({ state: "visible", timeout: 20000 });
      const sampleRow = route.path === "/stock/list"
        ? page.getByRole("textbox", { name: "Product name for DEMO Shiraz" })
        : page.getByText("DEMO Shiraz", { exact: true });
      await sampleRow.waitFor({ state: "visible", timeout: 20000 });
      const countTestId = route.path === "/stock/list" ? "stock-list-product-count" : route.path === "/stock/bulk-price-edit" ? "bulk-price-product-count" : null;
      const productCountText = countTestId
        ? (await page.getByTestId(countTestId).locator("..").textContent())?.replace(/\s+/g, " ").trim() ?? ""
        : null;
      const controlsAccessible = route.path === "/stock/bulk-price-edit"
        ? await page.getByRole("textbox", { name: "Search bulk price products" }).isVisible()
          && await page.getByRole("combobox", { name: "Category" }).isVisible()
          && await page.getByRole("textbox", { name: "New quantity" }).isVisible()
        : null;
      const table = page.getByTestId(route.testId);
      const mobileCardFieldResults = route.path === "/stock/list" && viewport.width === 390
        ? await Promise.all([
          page.getByRole("textbox", { name: "Product name for DEMO Shiraz" }).isVisible(),
          table.locator("dl dt", { hasText: "Category" }).last().isVisible(),
          table.locator("dl dt", { hasText: "Stock on hand" }).last().isVisible(),
          page.getByLabel("Price quantity for DEMO Shiraz", { exact: true }).last().isVisible(),
          page.getByLabel("Cost for DEMO Shiraz", { exact: true }).last().isVisible(),
          page.getByLabel("Price for DEMO Shiraz", { exact: true }).last().isVisible(),
          page.getByLabel("Profit margin for DEMO Shiraz", { exact: true }).last().isVisible(),
        ])
        : null;
      const mobileCardFields = mobileCardFieldResults ? mobileCardFieldResults.every(Boolean) : null;
      const layout = await table.evaluate((element) => {
        const scroller = element.parentElement;
        const header = element.querySelector(".sticky");
        const boxes = header ? Array.from(header.children).map((child) => child.getBoundingClientRect()) : [];
        const row = header?.nextElementSibling;
        const rowBoxes = row ? Array.from(row.children).slice(0, boxes.length).map((child) => child.getBoundingClientRect()) : [];
        const columnAlignmentIssues = boxes.flatMap((box, index) => {
          const rowBox = rowBoxes[index];
          if (!rowBox) return [{ column: index, reason: "missing body cell" }];
          const leftDelta = Math.round(Math.abs(box.left - rowBox.left));
          const rightDelta = Math.round(Math.abs(box.right - rowBox.right));
          return leftDelta <= 1 && rightDelta <= 1 ? [] : [{ column: index, leftDelta, rightDelta }];
        });
        const headerTextIssues = header ? Array.from(header.children).flatMap((child) => {
          const range = document.createRange();
          range.selectNodeContents(child);
          const childBox = child.getBoundingClientRect();
          const text = child.textContent?.trim() ?? "";
          const fits = Array.from(range.getClientRects()).every((rect) => rect.left >= childBox.left - 1 && rect.right <= childBox.right + 1);
          return fits ? [] : [{ text, width: Math.round(childBox.width), height: Math.round(childBox.height) }];
        }) : [{ text: "missing header", width: 0, height: 0 }];
        return {
          tableWidth: element.getBoundingClientRect().width,
          scrollerWidth: scroller?.clientWidth ?? 0,
          scrollerScrollWidth: scroller?.scrollWidth ?? 0,
          columnsDoNotOverlap: boxes.length > 0 && boxes.every((box, index) => index === 0 || boxes[index - 1].right <= box.left + 1),
          columnsAlignWithFirstRow: columnAlignmentIssues.length === 0,
          columnAlignmentIssues,
          headerTextIssues,
          headerTextFits: headerTextIssues.length === 0,
        };
      });
      const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
      const screenshot = path.join(outputDir, `${route.screenshot}-${viewport.width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      const horizontallyScrollable = layout.scrollerScrollWidth > layout.scrollerWidth;
      checks.push({
        route: route.path,
        viewport: viewport.width,
        httpStatus: response?.status() ?? 0,
        headingVisible: await heading.isVisible(),
        productCountText,
        controlsAccessible,
        sampleRowVisible: await sampleRow.isVisible(),
        mobileCardFields,
        mobileCardFieldResults,
        pageNoOverflow: dimensions.width <= dimensions.viewport + 1,
        internalHorizontalScroll: viewport.width === 390 && route.path !== "/stock/list" ? horizontallyScrollable : null,
        columnsDoNotOverlap: layout.columnsDoNotOverlap,
        columnsAlignWithFirstRow: layout.columnsAlignWithFirstRow,
        headerTextFits: layout.headerTextFits,
        layout,
        pageErrors,
        screenshot: path.relative(root, screenshot).replaceAll(path.sep, "/"),
      });
      await page.close();
    }
    await context.close();
  }
} catch (error) {
  checks.push({ route: activeRoute || "run", status: "FAIL", evidence: error instanceof Error ? error.message : "failed", requests: [...requests], blockedWrites: [...blockedWrites] });
} finally {
  await browser.close();
}

const failures = checks.filter((check) => check.status === "FAIL"
  || (check.httpStatus != null && (check.httpStatus < 200 || check.httpStatus >= 400))
  || check.headingVisible === false
  || (check.productCountText != null && !check.productCountText.endsWith("1 Product"))
  || check.controlsAccessible === false
  || check.sampleRowVisible === false
  || check.mobileCardFields === false
  || check.pageNoOverflow === false
  || (check.internalHorizontalScroll === false && check.route !== "/stock/list")
  || (check.viewport !== 390 || check.route !== "/stock/list") && check.columnsDoNotOverlap === false
  || (check.viewport !== 390 || check.route !== "/stock/list") && check.columnsAlignWithFirstRow === false
  || (check.viewport !== 390 || check.route !== "/stock/list") && check.headerTextFits === false
  || (check.pageErrors?.length ?? 0) > 0);
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  environment: "local-dev-fixtures",
  target: base,
  scope: "Stock List/Capped Pricing/Bulk Price Edit responsive table headers; API requests intercepted; no business writes",
  status: failures.length === 0 && blockedWrites.length === 0 ? "PASS" : "FAIL",
  passed: checks.length - failures.length,
  failed: failures.length,
  checks,
  blockedWrites,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: output.passed, failed: output.failed, blockedWrites: blockedWrites.length }));
if (failures.length > 0 || blockedWrites.length > 0) process.exitCode = 1;
