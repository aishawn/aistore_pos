import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3000";
const screenshotDir = process.env.PILOT_SCREENSHOT_DIR
  ? path.resolve(root, process.env.PILOT_SCREENSHOT_DIR)
  : null;
if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const blockedBusinessWrites = [];
const deleteRequests = [];
const readOnlyOdooQueries = [];
const screenshots = [];
let assistantRequests = 0;

await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
await context.addInitScript(() => {
  localStorage.setItem("sf_token", "local-uat-session");
  localStorage.setItem("sf_user", JSON.stringify({ id: "uat-admin", name: "UAT Admin", username: "admin", isAdmin: true, vendorId: 1, outletId: 1, platformOperator: false }));
});

const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.route("**/api/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (request.method() === "POST" && url.pathname === "/api/ai/assistant") {
    assistantRequests += 1;
    const question = String(JSON.parse(request.postData() ?? "{}").question ?? "").toLowerCase();
    const isDelete = question.startsWith("delete");
    const isArchive = question.startsWith("archive");
    const isUnsupportedCreate = question.startsWith("create balance");
    const isUnsupportedImport = question.startsWith("import balance");
    const isUnsupportedExport = question.startsWith("export balance");
    const isSupplierView = question.startsWith("view supplier");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 0,
        message: "OK",
        data: {
          threadId: "entity-invalid-op-fixture",
          intent: "entity_action",
          intentSummary: isDelete ? "Delete customer"
            : isArchive ? "Archive customer"
            : isSupplierView ? "View supplier"
            : "Entity action",
          answer: "Fixture response received.",
          slots: {
            entity: isUnsupportedCreate || isUnsupportedImport || isUnsupportedExport ? "balance"
              : isSupplierView ? "supplier" : "customer",
            op: isDelete ? "delete"
              : isArchive ? "archive"
              : isUnsupportedCreate ? "create"
              : isUnsupportedImport ? "import"
              : isUnsupportedExport ? "export"
              : isSupplierView ? "view" : "archive",
            query: isSupplierView ? "Acme Wines" : "Alex Example",
          },
          ui: null,
        },
      }),
    });
  }
  if (url.pathname === "/api/odoo/session" && request.method() === "GET") {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { uid: 7, name: "UAT Staff", username: "uat" }, autoRecoverConfigured: false }),
    });
  }
  if (url.pathname === "/api/odoo/pos-bootstrap" && request.method() === "GET") {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configs: [], activeSessionId: null }),
    });
  }
  if (url.pathname === "/api/odoo/records" && request.method() === "POST") {
    const body = JSON.parse(request.postData() ?? "{}");
    const type = String(body.type ?? "");
    const query = String(body.query ?? "");
    readOnlyOdooQueries.push({ type, query });
    const items = type === "suppliers" && query === "Acme Wines"
      ? [{ id: 101, name: "Acme Wines", phone: "+61 2 5550 0101", email: "sales@acme.example", vat: "12345678901", ref: "ACME", supplier_rank: 1 }]
      : type === "customers" && query === "Alex Example"
        ? [{ id: 202, name: "Alex Example", phone: "+61 4 0000 0202", email: "alex@example.test", customer_rank: 1, ref: "ALEX" }]
        : type === "products" && query === "VB Cans"
          ? [{ id: 303, name: "VB Cans", display_name: "VB Cans", barcode: "9300000000303", default_code: "VB-CANS", list_price: 54.95, taxes_id: [], price_included: 0, price_tax: 0, qty_available: 12, free_qty: 12, uom_id: [1, "Units"], pos_categ_ids: [], available_in_pos: true }]
          : [];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items, limit: body.limit ?? 40, offset: body.offset ?? 0 }),
    });
  }
  if (request.method() === "DELETE" && url.pathname === "/api/customers/777") {
    deleteRequests.push(`${request.method()} ${url.pathname}`);
    if (deleteRequests.length === 1) {
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: 50300, message: "UAT delete fixture failure" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: null }) });
  }
  if (request.method() !== "GET" && request.method() !== "HEAD" && request.method() !== "OPTIONS") {
    blockedBusinessWrites.push(`${request.method()} ${url.pathname}`);
    return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "UAT blocked API write" }) });
  }
  const data = url.pathname === "/api/auth/me"
    ? { id: "uat-admin", name: "UAT Admin", username: "admin", isAdmin: true, vendorId: 1, outletId: 1, platformOperator: false }
    : url.pathname === "/api/ai/config/client"
    ? { enabled: true, assistantAvailable: true, aiTriggerKeywords: [] }
    : url.pathname === "/api/customers"
      ? { items: [{ id: "777", name: "Alex Example", customerGroupName: "Default" }] }
      : url.pathname === "/api/suppliers"
        ? { items: [{ id: "supplier-1", name: "Acme Wines" }] }
      : [];
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data }) });
});

let result;
let supplierSearchPrefilled = false;
let customerSearchPrefilled = false;
let productSearchPrefilled = false;
let productImportDialogInteractive = false;
let productCreateDialogInteractive = false;
const searchPrefillResults = [];
const directoryFormResults = { supplierCreate: [], customerCreate: [], customerEdit: [] };
const emptySearchResults = [];
try {
  await page.goto(`${base}/overview?__uat_entity_guard=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const trigger = page.getByRole("button", { name: /Open Orithos AI/ }).first();
  await trigger.waitFor({ state: "visible", timeout: 30000 });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Orithos AI assistant" });
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  const composer = dialog.getByRole("textbox", { name: "Ask Orithos AI" });
  await composer.fill("archive customer Alex Example");
  await composer.press("Enter");
  await dialog.getByText("That action is not supported. Try listing or searching for the item instead.", { exact: true }).waitFor({ timeout: 10000 });
  const routeUnchangedAfterInvalidOp = new URL(page.url()).pathname === "/overview";

  await composer.fill("create balance");
  await composer.press("Enter");
  await dialog.getByText(/Creating customer balance from the assistant is not available\./).waitFor({ timeout: 10000 });
  const unsupportedCreateStayed = new URL(page.url()).pathname === "/overview";

  await composer.fill("import balance");
  await composer.press("Enter");
  await dialog.getByText(/Import is not available for customer balance from the assistant\./).waitFor({ timeout: 10000 });
  const unsupportedImportStayed = new URL(page.url()).pathname === "/overview";

  await composer.fill("export balance");
  await composer.press("Enter");
  await dialog.getByText(/Export is not available for customer balance from the assistant\./).waitFor({ timeout: 10000 });
  const unsupportedExportStayed = new URL(page.url()).pathname === "/overview";

  await composer.fill("delete customer Alex Example");
  await composer.press("Enter");
  const confirm = page.getByRole("alertdialog", { name: "Confirm Delete" });
  await confirm.waitFor({ state: "visible", timeout: 10000 });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await confirm.waitFor({ state: "hidden", timeout: 10000 });
  const cancelSentNoDelete = deleteRequests.length === 0;

  await composer.fill("delete customer Alex Example");
  await composer.press("Enter");
  const secondConfirm = page.getByRole("alertdialog", { name: "Confirm Delete" });
  await secondConfirm.waitFor({ state: "visible", timeout: 10000 });
  await secondConfirm.getByRole("button", { name: "Delete", exact: true }).evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await dialog.getByText("UAT delete fixture failure", { exact: true }).waitFor({ timeout: 10000 });
  const failureKeptConfirmationOpen = await secondConfirm.isVisible();
  const duplicateConfirmGuarded = deleteRequests.length === 1;
  await secondConfirm.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByText("Deleted customer “Alex Example”.", { exact: true }).waitFor({ timeout: 10000 });

  // Viewing a supplier must use the read-only Odoo directory, never the
  // legacy edit form. This is the final navigation check because the AI
  // dialog unmounts after a route change.
  await page.goto(`${base}/overview?__uat_entity_guard_supplier=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const supplierTrigger = page.getByRole("button", { name: /Open Orithos AI/ }).first();
  await supplierTrigger.waitFor({ state: "visible", timeout: 30000 });
  await supplierTrigger.click();
  const supplierDialog = page.getByRole("dialog", { name: "Orithos AI assistant" });
  await supplierDialog.getByRole("textbox", { name: "Ask Orithos AI" }).fill("view supplier Acme Wines");
  await supplierDialog.getByRole("textbox", { name: "Ask Orithos AI" }).press("Enter");
  await page.waitForURL(/\/suppliers\/odoo\?q=Acme%20Wines/, { timeout: 10000 });
  const supplierViewUsesReadOnlyDirectory = new URL(page.url()).pathname === "/suppliers/odoo"
    && new URL(page.url()).searchParams.get("q") === "Acme Wines";
  for (const width of [320, 390, 768, 1024, 1440]) {
    const viewportHeight = width < 1280 ? 844 : 900;
    const mobile = width < 1280;
    const compactPhone = width < 500;
    await page.setViewportSize({ width, height: viewportHeight });
    for (const [name, pathname, query, selector] of [
      ["supplier", "/suppliers/odoo", "Acme Wines", 'input[aria-label="Search suppliers by name, phone, email, ABN or reference"]'],
      ["customer", "/customers/odoo", "Alex Example", 'input[aria-label="Search customers by name, phone, email or customer code"]'],
      ["product", "/products/odoo", "VB Cans", 'input[aria-label="Search products by name, barcode or SKU"]'],
    ]) {
      await page.goto(`${base}${pathname}?q=${encodeURIComponent(query)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(
        ({ inputSelector, expected }) => document.querySelector(inputSelector)?.value === expected,
        { inputSelector: selector, expected: query },
        { timeout: 10000 },
      );
      const record = page.locator("article").filter({ hasText: query }).last();
      const tableRow = page.getByRole("row").filter({ hasText: query }).last();
      const expectedRecord = mobile ? record : tableRow;
      await expectedRecord.waitFor({ state: "visible", timeout: 15000 });
      const recordVisible = await expectedRecord.isVisible();
      const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      const searchWidth = await page.locator(selector).evaluate((element) => element.parentElement?.getBoundingClientRect().width ?? 0);
      const aiEntryPlacement = {
        headerVisible: await page.getByRole("button", { name: "Open Orithos AI assistant" }).isVisible(),
        floatingEntryHidden: await page.getByRole("button", { name: "Open Orithos AI", exact: true }).count() === 0,
      };
      let paginationSafe = true;
      if (mobile) {
        const nextButton = await page.getByRole("button", { name: /Next/ }).boundingBox();
        const aiButton = await page.getByRole("button", { name: /Open Orithos AI assistant/ }).boundingBox();
        paginationSafe = Boolean(nextButton && aiButton
          && (nextButton.x + nextButton.width <= aiButton.x + 1
            || aiButton.x + aiButton.width <= nextButton.x + 1
            || nextButton.y + nextButton.height <= aiButton.y + 1
            || aiButton.y + aiButton.height <= nextButton.y + 1));
      }
      let toolbar = null;
      let productCardFieldsFit = null;
      if (name === "supplier") {
        await page.getByRole("button", { name: "Add supplier", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Add supplier to Odoo" });
        await dialog.waitFor({ state: "visible", timeout: 5000 });
        const bounds = await dialog.boundingBox();
        const nameInput = dialog.getByRole("textbox", { name: /Business name/ });
        const requiredName = await nameInput.evaluate((element) => element.required);
        const focused = await nameInput.evaluate((element) => document.activeElement === element);
        const withinViewport = Boolean(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1
          && bounds.y >= 0 && bounds.y + bounds.height <= viewportHeight + 1);
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
        await dialog.waitFor({ state: "detached", timeout: 5000 });
        directoryFormResults.supplierCreate.push({ viewport: width, requiredName, focused, withinViewport, canceled: true });
      }
      if (name === "customer") {
        await page.getByRole("button", { name: "New customer", exact: true }).click();
        const createDialog = page.getByRole("dialog", { name: "New customer" });
        await createDialog.waitFor({ state: "visible", timeout: 5000 });
        const createBounds = await createDialog.boundingBox();
        const nameInput = createDialog.getByRole("textbox", { name: /Customer name/ });
        const requiredName = await nameInput.evaluate((element) => element.required);
        const createFits = Boolean(createBounds && createBounds.x >= 0 && createBounds.x + createBounds.width <= width + 1
          && createBounds.y >= 0 && createBounds.y + createBounds.height <= viewportHeight + 1);
        await createDialog.getByRole("button", { name: "Cancel", exact: true }).click();
        await createDialog.waitFor({ state: "detached", timeout: 5000 });
        directoryFormResults.customerCreate.push({ viewport: width, requiredName, withinViewport: createFits, canceled: true });

        await page.getByRole("button", { name: "Edit", exact: true }).last().click();
        const editDialog = page.getByRole("dialog", { name: "Edit customer" });
        await editDialog.waitFor({ state: "visible", timeout: 5000 });
        const editBounds = await editDialog.boundingBox();
        const editName = editDialog.getByRole("textbox", { name: /Customer name/ });
        const prefilledName = await editName.inputValue() === "Alex Example";
        const editFits = Boolean(editBounds && editBounds.x >= 0 && editBounds.x + editBounds.width <= width + 1
          && editBounds.y >= 0 && editBounds.y + editBounds.height <= viewportHeight + 1);
        await editDialog.getByRole("button", { name: "Cancel", exact: true }).click();
        await editDialog.waitFor({ state: "detached", timeout: 5000 });
        directoryFormResults.customerEdit.push({ viewport: width, prefilledName, withinViewport: editFits, canceled: true });
      }
      if (name === "product") {
        if (mobile) {
          productCardFieldsFit = await page.locator("article dl dd").evaluateAll((fields) => fields.every((field) =>
            field.scrollWidth <= field.clientWidth + 1,
          ));
        }
        const controls = [
          page.getByRole("button", { name: /Export( CSV)?/ }).first(),
          page.getByRole("button", { name: /Import( CSV)?/ }).first(),
          page.getByRole("button", { name: "New product", exact: true }),
          page.getByRole("button", { name: "Refresh products", exact: true }),
        ];
        const visible = await Promise.all(controls.map((control) => control.isVisible()));
        const boxes = await Promise.all(controls.map((control) => control.boundingBox()));
        const withinViewport = boxes.every((box) => box && box.x >= 0 && box.x + box.width <= width + 1);
        const noOverlap = boxes.every((box, index) => box && boxes.slice(index + 1).every((other) =>
          other && (box.x + box.width <= other.x + 1 || other.x + other.width <= box.x + 1
            || box.y + box.height <= other.y + 1 || other.y + other.height <= box.y + 1),
        ));
        toolbar = { controlsVisible: visible.every(Boolean), withinViewport, noOverlap };
        if (mobile) {
          await controls[1].click();
          const importDialog = page.getByRole("dialog", { name: "Import products from CSV" });
          await importDialog.waitFor({ state: "visible", timeout: 5000 });
          const importInputVisible = await importDialog.getByLabel("Choose a CSV file").isVisible();
          await importDialog.getByRole("button", { name: "Cancel", exact: true }).click();
          await importDialog.waitFor({ state: "detached", timeout: 5000 });
          productImportDialogInteractive = importInputVisible;

          await controls[2].click();
          const createDialog = page.getByRole("dialog", { name: "New product" });
          await createDialog.waitFor({ state: "visible", timeout: 5000 });
          const requiredNameVisible = await createDialog.getByRole("textbox", { name: "Product name" }).isVisible();
          await createDialog.getByRole("button", { name: "Cancel", exact: true }).click();
          await createDialog.waitFor({ state: "detached", timeout: 5000 });
          productCreateDialogInteractive = requiredNameVisible;
        }
      }
      const screenshot = screenshotDir
        ? path.join(screenshotDir, `${name}-${width}.png`)
        : null;
      if (screenshot) {
        await page.screenshot({ path: screenshot, fullPage: true });
        screenshots.push(path.relative(root, screenshot).replaceAll(path.sep, "/"));
      }
      searchPrefillResults.push({
        name,
        viewport: width,
        query,
        recordVisible,
        searchWidth,
        searchFitsMobileWidth: !compactPhone || searchWidth >= width - 64,
        aiEntryPlacement,
        paginationSafe,
        layout: mobile ? "mobile-card" : "desktop-table",
        overflow: layout.document > layout.viewport,
        toolbar,
        productCardFieldsFit,
        screenshot: screenshot ? path.relative(root, screenshot).replaceAll(path.sep, "/") : null,
      });

      const emptyState = {
        supplier: { message: "No suppliers found", clearButton: "Clear search" },
        customer: { message: "No customers match this search", clearButton: "Clear search" },
        product: { message: "No matching products", clearButton: "Clear filters" },
      }[name];
      const searchInput = page.locator(selector);
      await searchInput.fill("UAT no matching record");
      await page.waitForFunction(
        ({ message }) => [...document.querySelectorAll("h2, p")].some((element) =>
          element.textContent?.trim() === message && element.getClientRects().length > 0),
        { message: emptyState.message },
        { timeout: 10000 },
      );
      await page.getByRole("button", { name: emptyState.clearButton, exact: true }).click();
      await page.waitForFunction(
        ({ inputSelector }) => document.querySelector(inputSelector)?.value === "",
        { inputSelector: selector },
        { timeout: 5000 },
      );
      emptySearchResults.push({ name, viewport: width, emptyMessageShown: true, clearRestoredEmptyQuery: true });
    }
  }
  supplierSearchPrefilled = searchPrefillResults.filter((item) => item.name === "supplier").length === 5
    && searchPrefillResults.filter((item) => item.name === "supplier").every((item) => !item.overflow && item.recordVisible && item.searchFitsMobileWidth && item.paginationSafe && item.aiEntryPlacement.headerVisible && item.aiEntryPlacement.floatingEntryHidden);
  customerSearchPrefilled = searchPrefillResults.filter((item) => item.name === "customer").length === 5
    && searchPrefillResults.filter((item) => item.name === "customer").every((item) => !item.overflow && item.recordVisible && item.searchFitsMobileWidth && item.paginationSafe && item.aiEntryPlacement.headerVisible && item.aiEntryPlacement.floatingEntryHidden);
  productSearchPrefilled = searchPrefillResults.filter((item) => item.name === "product").length === 5
    && searchPrefillResults.filter((item) => item.name === "product").every((item) => !item.overflow && item.recordVisible
      && item.searchFitsMobileWidth && item.paginationSafe && item.aiEntryPlacement.headerVisible && item.aiEntryPlacement.floatingEntryHidden
      && item.toolbar?.controlsVisible && item.toolbar.withinViewport && item.toolbar.noOverlap
      && (!item.viewport || item.viewport >= 1280 || item.productCardFieldsFit));

  result = {
    routeUnchanged: routeUnchangedAfterInvalidOp,
    unsupportedActionExplained: true,
    unsupportedCreateStayed,
    unsupportedImportStayed,
    unsupportedExportStayed,
    supplierViewUsesReadOnlyDirectory,
    supplierSearchPrefilled,
    customerSearchPrefilled,
    productSearchPrefilled,
    productImportDialogInteractive,
    productCreateDialogInteractive,
    searchPrefillResults,
    directoryFormResults,
    emptySearchResults,
    readOnlyOdooQueries,
    screenshots,
    deleteConfirmationShown: true,
    cancelDismissedConfirmation: true,
    cancelSentNoDelete,
    failureKeptConfirmationOpen,
    duplicateConfirmGuarded,
    retryCompletedDelete: deleteRequests.length === 2
      && deleteRequests.every((request) => request === "DELETE /api/customers/777"),
    assistantRequests,
    deleteRequests,
    readOnlyOdooQueries,
    screenshots,
    blockedBusinessWrites,
    pageErrors,
  };
} catch (error) {
  result = {
    routeUnchanged: false,
    unsupportedActionExplained: false,
    deleteConfirmationShown: false,
    cancelDismissedConfirmation: false,
    cancelSentNoDelete: false,
    failureKeptConfirmationOpen: false,
    retryCompletedDelete: false,
    supplierSearchPrefilled,
    customerSearchPrefilled,
    productSearchPrefilled,
    productImportDialogInteractive,
    productCreateDialogInteractive,
    searchPrefillResults,
    directoryFormResults,
    emptySearchResults,
    assistantRequests,
    deleteRequests,
    blockedBusinessWrites,
    pageErrors,
    failure: error instanceof Error ? error.message : "UNEXPECTED_FAILURE",
  };
} finally {
  await context.close();
  await browser.close();
}

const passed = result.routeUnchanged
  && result.unsupportedActionExplained
  && result.unsupportedCreateStayed
  && result.unsupportedImportStayed
  && result.unsupportedExportStayed
  && result.supplierViewUsesReadOnlyDirectory
  && result.supplierSearchPrefilled
  && result.customerSearchPrefilled
  && result.productSearchPrefilled
  && result.productImportDialogInteractive
  && result.productCreateDialogInteractive
  && result.deleteConfirmationShown
  && result.cancelDismissedConfirmation
  && result.cancelSentNoDelete
  && result.failureKeptConfirmationOpen
  && result.duplicateConfirmGuarded
  && result.retryCompletedDelete
  && result.assistantRequests === 7
    && result.searchPrefillResults.length === 15
  && Object.values(result.directoryFormResults).every((checks) => checks.length === 5
    && checks.every((check) => check.withinViewport && check.canceled))
  && result.directoryFormResults.supplierCreate.every((check) => check.requiredName && check.focused)
  && result.directoryFormResults.customerCreate.every((check) => check.requiredName)
  && result.directoryFormResults.customerEdit.every((check) => check.prefilledName)
    && result.emptySearchResults.length === 15
  && result.emptySearchResults.every((check) => check.emptyMessageShown && check.clearRestoredEmptyQuery)
  && result.blockedBusinessWrites.length === 0
  && result.pageErrors.length === 0;
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  worktreeChangesIncluded: true,
  nodeVersion: process.version,
  target: base,
  scope: "AI entity action guards, fixture-only delete confirmation/retry, Odoo directory query prefill and result rendering at 320/390/768/1024/1440; APIs intercepted; Odoo record POSTs are read-only fixtures",
  status: passed ? "PASS" : "FAIL",
  result,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_ENTITY_INVALID_OP_LOCAL.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, result }));
if (!passed) process.exitCode = 1;
