/** Fixture UAT for stock and pricing layouts at mobile/desktop widths. */
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
const viewports = [320, 390, 768, 1024, 1440].map((width) => ({
  width,
  height: width < 1280 ? 844 : 900,
}));
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
      if (request.method() === "POST" && url.pathname === "/api/odoo/records") {
        let body = {};
        try { body = request.postDataJSON() ?? {}; } catch { body = {}; }
        if (body?.type === "products") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              items: [{ id: 101, name: "DEMO Shiraz", display_name: "DEMO Shiraz", barcode: false, default_code: "DEMO-SHIRAZ", list_price: 14, taxes_id: [], price_included: 14, price_tax: 0, qty_available: 4, free_qty: 4, uom_id: [1, "Units"], pos_categ_ids: [], available_in_pos: true }],
              limit: 30,
              offset: body.offset ?? 0,
            }),
          });
        }
        if (body?.type === "posCategories") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ items: [{ id: 10, name: "Wine", parent_id: false }], limit: 100, offset: 0 }),
          });
        }
      }
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
      if (url.pathname === "/api/odoo/pricelist-items") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: "rule-1", productId: 101, productName: "DEMO Shiraz", sku: "DEMO-SHIRAZ", priceSetName: "Demo Retail", source: "Odoo price rule", sourceType: "PROVIDED", startDate: "2026-01-01", endDate: "2026-12-31", quantity: 1, cappedPrice: 16, currentPrice: 14, cost: null, ruleType: "fixed" }], limit: 30, offset: 0, hasNext: false }) });
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
      const countTestId = route.path === "/stock/list" ? "stock-list-product-count" : null;
      const productCountText = countTestId
        ? (await page.getByTestId(countTestId).locator("..").textContent())?.replace(/\s+/g, " ").trim() ?? ""
        : null;
      const controlsAccessible = route.path === "/stock/bulk-price-edit"
        ? await page.getByRole("textbox", { name: "Search bulk price products" }).isVisible()
          && await page.getByRole("spinbutton", { name: "Price for DEMO Shiraz", exact: true }).isVisible()
        : null;
      const costManagement = route.path === "/stock/list"
        ? await page.locator('input[aria-label="Cost for DEMO Shiraz"]:visible').first().evaluate((input) => {
          const style = getComputedStyle(input);
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) return { fits: false, description: "" };
          context.font = style.font;
          const availableWidth = input.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
          const descriptionId = input.getAttribute("aria-describedby");
          return {
            fits: context.measureText(input.placeholder).width <= availableWidth + 1,
            placeholder: input.placeholder,
            textWidth: context.measureText(input.placeholder).width,
            availableWidth,
            description: descriptionId ? document.getElementById(descriptionId)?.textContent?.trim() ?? "" : "",
          };
        })
        : null;
      let clearFiltersAccessible = null;
      if (route.path === "/stock/list") {
        const searchBox = page.getByRole("textbox", { name: "Search stock products" });
        await searchBox.fill("Shiraz");
        const clear = page.getByRole("button", { name: "Clear stock list filters" });
        clearFiltersAccessible = await clear.isVisible();
        clearFiltersAccessible = clearFiltersAccessible
          && (await clear.getAttribute("class"))?.includes("focus-visible:outline")
          && (await page.getByRole("button", { name: "Export to CSV" }).getAttribute("class"))?.includes("focus-visible:outline");
        await clear.click();
        clearFiltersAccessible = clearFiltersAccessible && (await searchBox.inputValue()) === "";
      } else if (route.path === "/stock/capped-pricing") {
        const searchBox = page.getByRole("textbox", { name: "Search Odoo price rules" });
        await searchBox.fill("Shiraz");
        const clear = page.getByRole("button", { name: "Clear price rule search" });
        clearFiltersAccessible = await clear.isVisible();
        await clear.click();
        clearFiltersAccessible = clearFiltersAccessible && (await searchBox.inputValue()) === "";
      } else if (route.path === "/stock/bulk-price-edit") {
        const searchBox = page.getByRole("textbox", { name: "Search bulk price products" });
        await searchBox.fill("Shiraz");
        const clear = page.getByRole("button", { name: "Clear product search" });
        clearFiltersAccessible = await clear.isVisible();
        await clear.click();
        clearFiltersAccessible = clearFiltersAccessible && (await searchBox.inputValue()) === ""
          && !(await page.getByRole("button", { name: "Clear product search" }).isVisible().catch(() => false));
      }
      const table = route.path === "/stock/bulk-price-edit"
        ? page.locator("ul > li").filter({ hasText: "DEMO Shiraz" }).first()
        : page.getByTestId(route.testId);
      let mobileCardFieldResults = null;
      let importPanelAccessible = null;
      let addedQuantityAccessible = null;
      let mobileSearchWidth = null;
      if (viewport.width < 1280 && route.path === "/stock/list") {
        mobileCardFieldResults = await Promise.all([
          page.getByRole("textbox", { name: "Product name for DEMO Shiraz" }).isVisible(),
          table.locator("dl dt", { hasText: "Category" }).last().isVisible(),
          table.locator("dl dt", { hasText: "Stock on hand" }).last().isVisible(),
          page.getByLabel("Price quantity for DEMO Shiraz", { exact: true }).last().isVisible(),
          page.getByLabel("Cost for DEMO Shiraz", { exact: true }).last().isVisible(),
          page.getByLabel("Price for DEMO Shiraz", { exact: true }).last().isVisible(),
          page.getByLabel("Profit margin for DEMO Shiraz", { exact: true }).last().isVisible(),
        ]);
      } else if (viewport.width < 1280 && route.path === "/stock/capped-pricing") {
        const card = page.getByTestId("capped-pricing-card");
        const currentPrice = page.getByRole("spinbutton", { name: "Current price for DEMO Shiraz" });
        const unchangedPrice = await currentPrice.inputValue();
        await currentPrice.fill(unchangedPrice);
        await currentPrice.blur();
        mobileCardFieldResults = await Promise.all([
          card.getByText("DEMO Shiraz", { exact: true }).isVisible(),
          card.getByTestId("capped-price-source").isVisible(),
          card.getByText("Start Date", { exact: true }).isVisible(),
          card.getByText("End Date", { exact: true }).isVisible(),
          card.getByText("Quantity", { exact: true }).isVisible(),
          card.getByText("Capped Price", { exact: true }).isVisible(),
          currentPrice.isVisible(),
          card.getByText("Margin", { exact: true }).isVisible(),
        ]);
        importPanelAccessible = true;
      } else if (viewport.width < 1280 && route.path === "/stock/bulk-price-edit") {
        const card = table;
        const priceInput = page.getByRole("spinbutton", { name: "Price for DEMO Shiraz", exact: true });
        const unchangedPrice = await priceInput.inputValue();
        await priceInput.fill(unchangedPrice);
        await priceInput.blur();
        mobileCardFieldResults = [
          await card.getByText("DEMO Shiraz", { exact: true }).isVisible(),
          await card.getByText("DEMO-SHIRAZ", { exact: false }).isVisible(),
          await card.getByText("Current list", { exact: false }).isVisible(),
          await priceInput.isVisible(),
        ];
        const searchBox = page.getByRole("textbox", { name: "Search bulk price products" });
        mobileSearchWidth = await searchBox.evaluate((input) => input.getBoundingClientRect().width);
        addedQuantityAccessible = null;
      }
      const mobileCardFields = mobileCardFieldResults ? mobileCardFieldResults.every(Boolean) : null;
      const layout = await table.evaluate((element) => {
        const scroller = element.parentElement;
        const header = element.querySelector(".sticky");
        const headerVisible = header ? getComputedStyle(header).display !== "none" : false;
        if (!headerVisible) {
          const card = element.querySelector('[data-testid="capped-pricing-card"], [data-testid="bulk-price-card"]')
            || (element.matches("ul, li") ? element : null);
          return {
            tableWidth: element.getBoundingClientRect().width,
            scrollerWidth: scroller?.clientWidth ?? 0,
            scrollerScrollWidth: scroller?.scrollWidth ?? 0,
            columnsDoNotOverlap: true,
            columnsAlignWithFirstRow: true,
            columnAlignmentIssues: [],
            headerTextIssues: [],
            headerTextFits: true,
            mobileCardWidth: card ? card.getBoundingClientRect().width : 0,
          };
        }
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
      const aiEntryPlacement = {
        headerVisible: await page.getByRole("button", { name: "Open Orithos AI assistant" }).isVisible(),
        floatingEntryHidden: await page.getByRole("button", { name: "Open Orithos AI", exact: true }).count() === 0,
      };
      await page.getByRole("button", { name: "Open Orithos AI assistant" }).click();
      const assistantDialog = page.getByRole("dialog", { name: "Orithos AI assistant" });
      await assistantDialog.waitFor({ state: "visible", timeout: 10000 });
      aiEntryPlacement.headerOpensAssistant = true;
      await assistantDialog.getByRole("button", { name: "Close assistant" }).click();
      await assistantDialog.waitFor({ state: "detached", timeout: 5000 });
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
        costManagement,
        clearFiltersAccessible,
        sampleRowVisible: await sampleRow.isVisible(),
        mobileCardFields,
        mobileCardFieldResults,
        importPanelAccessible,
        addedQuantityAccessible,
        mobileSearchWidth,
        pageNoOverflow: dimensions.width <= dimensions.viewport + 1,
        mobileContentWidth: viewport.width >= 1280 || layout.tableWidth >= layout.scrollerWidth - 64,
        aiEntryPlacement,
        internalHorizontalScroll: viewport.width < 1280 && route.path !== "/stock/list" ? horizontallyScrollable : null,
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
  || check.costManagement?.fits === false
  || (check.costManagement && check.costManagement.description !== "Cost is managed in purchasing.")
  || check.sampleRowVisible === false
  || check.mobileCardFields === false
  || check.clearFiltersAccessible === false
  || check.importPanelAccessible === false
  || check.addedQuantityAccessible === false
  || (check.mobileSearchWidth != null && check.mobileSearchWidth < 160)
  || check.pageNoOverflow === false
  || check.mobileContentWidth === false
  || check.aiEntryPlacement?.headerVisible === false
  || check.aiEntryPlacement?.floatingEntryHidden === false
  || check.aiEntryPlacement?.headerOpensAssistant === false
  || (check.internalHorizontalScroll === true)
  || (check.viewport < 1280 && check.route !== "/stock/list" && (check.layout?.mobileCardWidth ?? 0) <= 0)
  || (check.viewport >= 1280 && check.columnsDoNotOverlap === false)
  || (check.viewport >= 1280 && check.columnsAlignWithFirstRow === false)
  || (check.viewport >= 1280 && check.headerTextFits === false)
  || (check.pageErrors?.length ?? 0) > 0);
const forbiddenLegacyRequests = requests.filter((request) => /\/api\/(stock-list|classifications\/category|capped-pricing)(?:\/|\?|$)/.test(request));
if (forbiddenLegacyRequests.length > 0) failures.push({ status: "FAIL", reason: "legacy stock route requested", requests: forbiddenLegacyRequests });
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceWorkingTree: execFileSync("git", ["status", "--porcelain", "--", "pos-ui/src/components/Header.tsx", "pos-ui/src/components/AiFloatHost.tsx", "pos-ui/src/components/SellAiPanel.tsx", "pos-ui/src/components/admin/StockListPage.tsx", "pos-ui/src/components/admin/CappedPricingPage.tsx", "pos-ui/src/components/admin/BulkPriceEditPage.tsx", "pos-ui/src/lib/ai-entry-placement.ts", "scripts/pilot-stock-tables-responsive-local-uat.mjs"], { cwd: root, encoding: "utf8" }).trim().length > 0,
  testedFiles: [
    "pos-ui/src/components/Header.tsx",
    "pos-ui/src/components/AiFloatHost.tsx",
    "pos-ui/src/components/SellAiPanel.tsx",
    "pos-ui/src/components/admin/StockListPage.tsx",
    "pos-ui/src/components/admin/CappedPricingPage.tsx",
    "pos-ui/src/components/admin/BulkPriceEditPage.tsx",
    "pos-ui/src/lib/ai-entry-placement.ts",
    "scripts/pilot-stock-tables-responsive-local-uat.mjs",
  ],
  environment: "local-dev-fixtures",
  nodeVersion: process.version,
  target: base,
  scope: "Stock List/Capped Pricing/Bulk Price Edit mobile content width, card fields, editing and controls; desktop column alignment; header AI opens/closes and floating launcher is suppressed on dense routes; API requests intercepted; no business writes",
  status: failures.length === 0 && blockedWrites.length === 0 ? "PASS" : "FAIL",
  passed: checks.length - failures.length,
  failed: failures.length,
  checks,
  requests,
  forbiddenLegacyRequests,
  blockedWrites,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: output.passed, failed: output.failed, blockedWrites: blockedWrites.length }));
if (failures.length > 0 || blockedWrites.length > 0) process.exitCode = 1;
