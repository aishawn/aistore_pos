/** All API traffic is intercepted. This verifies UI behavior, never live Odoo writes. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL || "http://demo.localhost:3037";
const output = path.join(root, "docs/UAT_STOCK_WORKSPACE_LOCAL_2026-10-25.json");
const screenshots = path.join(root, "docs/screenshots/stock-workspace-2026-10-25");
fs.mkdirSync(screenshots, { recursive: true });
const checks = [];
const writes = [];
const envelope = (data) => ({ code: 0, message: "OK", data });
const product = { id: 81, name: "Fixture Shiraz", display_name: "Fixture Shiraz", barcode: "9300000081", default_code: "W81", list_price: 20, qty_available: 5, free_qty: 5, uom_id: [1, "Units"], pos_categ_ids: [1], available_in_pos: true, taxes_id: [] };
const browser = await chromium.launch({ headless: true });

async function fixture(context, user) {
  let expectedQty = 5;
  let unknown = false;
  let categories = [{ id: 1, name: "Wine", parent_id: false, editable: true, productCount: 1, childCount: 0 }, { id: 2, name: "Shared", parent_id: false, editable: false, productCount: 0, childCount: 0 }];
  await context.addCookies([{ name: "orithos_access_token", value: "stock-workspace-fixture", url: base }]);
  await context.route("**/api/**", async (route) => {
    const request = route.request(); const url = new URL(request.url()); const method = request.method(); const p = url.pathname;
    if (p === "/api/auth/me") return route.fulfill({ json: envelope(user) });
    if (p === "/api/odoo/session") return route.fulfill({ json: { user: { uid: 1, name: "Fixture", database: "fixture" } } });
    if (p === "/api/odoo/pos-bootstrap") return route.fulfill({ json: { configs: [{ id: 1, name: "Fixture", timezone: "Australia/Adelaide" }], paymentMethods: [] } });
    if (p === "/api/odoo/records") {
      const body = request.postDataJSON();
      return route.fulfill({ json: { items: body.type === "posCategories" ? categories : body.type === "products" ? [product] : [], hasNext: false } });
    }
    if (p === "/api/odoo/categories" && method === "GET") return route.fulfill({ json: { items: categories, hasNext: false, writeEnabled: true } });
    if (p.startsWith("/api/odoo/categories") && method !== "GET") {
      writes.push({ path: p, method });
      const body = method === "DELETE" ? {} : request.postDataJSON();
      if (method === "POST") categories.push({ id: 3, name: body.name, parent_id: false, editable: true, productCount: 0, childCount: 0 });
      if (method === "PATCH") categories = categories.map((item) => item.id === Number(p.split("/").at(-1)) ? { ...item, name: body.name } : item);
      if (method === "DELETE") categories = categories.filter((item) => item.id !== Number(p.split("/").at(-1)));
      return route.fulfill({ json: { id: 3 } });
    }
    if (p === "/api/odoo/stocktake" && method === "GET") {
      const matches = url.searchParams.has("q") || url.searchParams.has("ids");
      return route.fulfill({ json: envelope({ locations: [{ id: 9, name: "Fixture stock" }], defaultLocationId: 9, selectedLocation: { id: 9, name: "Fixture stock" }, writeEnabled: true, locationSource: "tenant-binding", products: matches ? [{ id: 81, name: product.name, sku: "W81", barcode: product.barcode, uom: "Units", expectedQty, eligible: true, ineligibleReason: null }] : [] }) });
    }
    if (p === "/api/odoo/stocktake" && method === "POST") {
      writes.push({ path: p, method, body: request.postDataJSON() });
      await new Promise((resolve) => setTimeout(resolve, unknown ? 1200 : 500));
      return unknown ? route.fulfill({ status: 502, json: { code: 50290, message: "Fixture result unknown" } }) : route.fulfill({ json: envelope({ applied: 1, locationName: "Fixture stock" }) });
    }
    if (p === "/api/odoo/purchase-orders") return route.fulfill({ json: { items: [], hasNext: false } });
    if (p === "/api/odoo/replenishment") return route.fulfill({ json: { company: "Fixture", historyDays: 56, periodDays: 28, coverageDays: Number(url.searchParams.get("coverageDays") || 21), products: [], truncated: false, generatedAt: new Date().toISOString() } });
    if (p.includes("invoice") && method === "GET") return route.fulfill({ json: envelope({ items: [], total: 0 }) });
    if (method !== "GET") throw new Error(`Unexpected fixture write ${method} ${p}`);
    return route.fulfill({ json: envelope([]) });
  });
  return { setExpected: (value) => { expectedQty = value; }, setUnknown: () => { unknown = true; }, setEmployee: (id) => { user.id = id; } };
}

try {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const mock = await fixture(context, { id: 17, vendorId: 7, username: "fixture", name: "Fixture", isAdmin: true });
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const check = (name, ok) => { checks.push({ width, name, status: ok ? "PASS" : "FAIL" }); assert.ok(ok, `${width}: ${name}`); };
    try {
      await page.goto(`${base}/products/odoo`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Manage Categories", exact: true }).click();
      let dialog = page.getByRole("dialog", { name: "Manage Categories", exact: true });
      await dialog.getByText("Shared · read-only", { exact: false }).waitFor();
      check("shared categories show read-only", await dialog.getByText("Shared · read-only", { exact: false }).isVisible());
      await dialog.getByRole("button", { name: "New category", exact: true }).click();
      await dialog.getByLabel("Name", { exact: true }).fill("Spirits");
      await dialog.getByRole("button", { name: "Save category", exact: true }).click();
      await dialog.getByText("Spirits", { exact: true }).waitFor();
      check("category created and list refreshed", await dialog.getByText("Spirits", { exact: true }).isVisible());
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await page.waitForURL((url) => !url.searchParams.has("dialog"));
      await page.getByRole("button", { name: "Stocktake", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Stocktake", exact: true });
      await dialog.getByLabel("Search or scan a product").fill("Shiraz");
      await dialog.getByRole("button", { name: "Add to count", exact: true }).click();
      await dialog.getByLabel(`Counted quantity for ${product.name}`, { exact: true }).filter({ visible: true }).fill("3");
      await dialog.getByRole("button", { name: "Close & keep draft", exact: true }).click();
      await page.waitForURL((url) => !url.searchParams.has("dialog"));
      mock.setExpected(6);
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Stocktake", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Stocktake", exact: true });
      await dialog.getByText(/Stock has changed since/).waitFor();
      check("draft survives close and refresh with fresh expected quantity", await dialog.getByLabel(`Counted quantity for ${product.name}`, { exact: true }).filter({ visible: true }).inputValue() === "3");
      await page.screenshot({ path: path.join(screenshots, `stocktake-${width}.png`), fullPage: true });
      check("stocktake fits viewport", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await dialog.getByRole("button", { name: "Expand to full page", exact: true }).click();
      await page.getByText("Saved count restored.", { exact: false }).waitFor();
      check("expanded stocktake shares saved quantities", await page.getByLabel(`Counted quantity for ${product.name}`, { exact: true }).filter({ visible: true }).inputValue() === "3");
      await page.getByRole("button", { name: "Review and apply", exact: true }).click();
      // Existing ConfirmDialog identifies itself using aria-labelledby.
      await page.getByRole("button", { name: "Apply adjustments", exact: true }).click();
      await page.getByText(/Applied 1 stock adjustment/).waitFor();
      check("successful stocktake clears draft", await page.evaluate(() => !Object.keys(localStorage).some((key) => key.startsWith("orithos:stocktake:v1:"))));
      await page.goto(`${base}/purchases/odoo`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Purchasing", exact: true }).waitFor();
      await page.getByRole("link", { name: "Replenishment", exact: true }).click();
      await page.getByText(/Rule-based reorder suggestions/).waitFor();
      await page.getByRole("link", { name: "Supplier Invoices", exact: true }).click();
      await page.getByRole("link", { name: "Scan invoice", exact: true }).first().waitFor();
      check("purchasing tabs embed replenishment and invoices", await page.getByRole("heading", { name: "Purchasing", exact: true }).count() === 1);
      await page.screenshot({ path: path.join(screenshots, `purchasing-${width}.png`), fullPage: true });
      check("purchasing fits viewport", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      check("no uncaught browser errors", errors.length === 0);
      if (width === 390) {
        await page.goto(`${base}/products/odoo?dialog=stocktake`, { waitUntil: "networkidle" });
        await page.getByLabel("Search or scan a product").fill("Shiraz");
        await page.getByRole("button", { name: "Add to count", exact: true }).click();
        await page.getByLabel(`Counted quantity for ${product.name}`, { exact: true }).filter({ visible: true }).fill("2");
        mock.setUnknown();
        await page.getByRole("button", { name: "Review and apply", exact: true }).click();
        const posting = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/odoo/stocktake" && request.method() === "POST");
        await page.getByRole("button", { name: "Apply adjustments", exact: true }).click();
        await posting;
        check("close is disabled during adjustment submission", await page.getByRole("button", { name: "Close & keep draft", exact: true }).isDisabled());
        await page.keyboard.press("Escape");
        await page.getByText(/Reconcile it in Odoo/).waitFor();
        await page.reload({ waitUntil: "networkidle" });
        await page.getByText(/Reconcile it in Odoo/).waitFor();
        check("unknown result persists and blocks replay after refresh", await page.getByRole("button", { name: "Review and apply", exact: true }).isDisabled());
        mock.setEmployee(19);
        await page.reload({ waitUntil: "networkidle" });
        await page.getByText("Search or scan a product", { exact: true }).waitFor();
        check("another employee cannot inherit the previous employee's draft", await page.getByLabel(`Counted quantity for ${product.name}`, { exact: true }).count() === 0);
      }
    } catch (error) { checks.push({ width, name: "scenario completion", status: "FAIL", error: error.message, browserErrors: errors }); await page.screenshot({ path: path.join(screenshots, `failure-${width}.png`), fullPage: true }); }
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 768, height: 1000 } });
    await fixture(context, { id: 20, vendorId: 7, username: "compatibility", name: "Compatibility", isAdmin: true });
    const page = await context.newPage();
    try {
      for (const [legacy, destination] of [["/stock/replenishment", "/purchases/odoo?tab=replenishment"], ["/invoices", "/purchases/odoo?tab=invoices"], ["/classifications/brand/123/assign", "/products/odoo?dialog=categories"], ["/stock/stocktake", "/products/odoo?tab=stocktake"]]) {
        await page.goto(`${base}${legacy}`, { waitUntil: "networkidle" });
        assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, destination);
        checks.push({ name: `${legacy} compatibility redirect`, status: "PASS" });
      }
      await page.goto(`${base}/products/odoo?q=seed`, { waitUntil: "networkidle" });
      const search = page.getByLabel("Search products by name, barcode or SKU", { exact: true });
      await search.fill("staff query");
      await page.getByRole("combobox", { name: "POS category", exact: true }).selectOption("1");
      await page.getByRole("button", { name: "Manage Categories", exact: true }).click();
      await page.getByRole("dialog", { name: "Manage Categories", exact: true }).waitFor();
      await page.screenshot({ path: path.join(screenshots, "categories-768.png"), fullPage: true });
      await page.keyboard.press("Escape");
      await page.waitForURL((url) => !url.searchParams.has("dialog"));
      assert.equal(await search.inputValue(), "staff query");
      assert.equal(await page.getByRole("combobox", { name: "POS category", exact: true }).inputValue(), "1");
      checks.push({ name: "category dialog preserves product search and filter", status: "PASS" });
      assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Manage Categories");
      checks.push({ name: "Escape closes dialog and restores opener focus", status: "PASS" });
    } catch (error) { checks.push({ name: "compatibility and product state", status: "FAIL", error: error.message }); }
    await context.close();
  }
  for (const [permission, tab] of [["stock.replenishment", "replenishment"], ["stock.invoices", "invoices"]]) {
    const context = await browser.newContext({ viewport: { width: 768, height: 1000 } });
    await fixture(context, { id: 18, vendorId: 7, username: "restricted", name: "Restricted", isAdmin: false, permissions: [permission] });
    const page = await context.newPage();
    try {
      await page.goto(`${base}/purchases/odoo`, { waitUntil: "networkidle" });
      await page.waitForURL(`**/purchases/odoo?tab=${tab}`);
      const orders = page.getByRole("navigation", { name: "Purchasing views" }).getByRole("link", { name: "Orders", exact: true });
      checks.push({ name: `${permission} only: permitted default, orders hidden`, status: await orders.count() === 0 ? "PASS" : "FAIL" });
    } catch (error) { checks.push({ name: `${permission} only`, status: "FAIL", error: error.message }); }
    await context.close();
  }
} finally {
  await browser.close();
  const report = { environment: "local intercepted browser fixture", base, liveBusinessWrites: 0, checks, fixtureWrites: writes };
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: output, pass: checks.filter((check) => check.status === "PASS").length, fail: checks.filter((check) => check.status === "FAIL").length }));
  if (checks.some((check) => check.status === "FAIL")) process.exitCode = 1;
}
