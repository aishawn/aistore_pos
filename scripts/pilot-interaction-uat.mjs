import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);
const base = "https://demo.orithos.com.au";
const password = env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const checks = [];

async function check(name, run) {
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    const evidence = await run();
    checks.push({ name, status: "PASS", evidence });
  } catch (error) {
    checks.push({ name, status: "FAIL", evidence: error instanceof Error ? error.message : "Unexpected failure" });
  }
}

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error("Pilot interaction UAT login failed");

  await check("Mobile navigation drawer opens and dismisses", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/overview`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const trigger = page.locator('button[aria-controls="main-navigation"]');
    const navigation = page.locator("#main-navigation");
    const backdrop = page.locator('button[aria-label="Close navigation menu"]:not([aria-controls])');
    await trigger.waitFor({ timeout: 15000 });
    await page.waitForFunction(() => {
      const toggle = document.querySelector('button[aria-controls="main-navigation"]');
      const navigation = document.querySelector("#main-navigation");
      return toggle?.getAttribute("aria-expanded") === "false" && navigation?.getAttribute("aria-hidden") === "true";
    }, null, { timeout: 15000 });
    await trigger.click();
    if (await trigger.getAttribute("aria-expanded") !== "true" || await navigation.getAttribute("aria-hidden") !== "false") {
      throw new Error("Mobile navigation did not expose its expanded state");
    }
    // Let the open-state effect register its Escape handler before dispatching the key.
    await page.waitForTimeout(50);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => {
      const toggle = document.querySelector('button[aria-controls="main-navigation"]');
      const navigation = document.querySelector("#main-navigation");
      return toggle?.getAttribute("aria-expanded") === "false" && navigation?.getAttribute("aria-hidden") === "true";
    }, null, { timeout: 1500 }).catch(() => { throw new Error("Escape did not close the mobile navigation"); });
    await trigger.click();
    await backdrop.click({ position: { x: 350, y: 100 } });
    if (await trigger.getAttribute("aria-expanded") !== "false") throw new Error("Outside click did not close the mobile navigation");
    await page.setViewportSize({ width: 1440, height: 900 });
    return "At 390px, the navigation drawer opens and closes with Escape and the outside backdrop; ARIA state tracks visibility.";
  });

  await check("Compact account popover opens and closes accessibly", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/overview`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const trigger = page.locator("[data-user-menu-trigger]");
    const menu = page.getByRole("dialog", { name: "User menu" });
    await trigger.waitFor({ timeout: 15000 });
    if (await trigger.getAttribute("aria-expanded") !== "false") throw new Error("Account menu is not initially collapsed");
    await trigger.click();
    await menu.waitFor({ state: "visible", timeout: 10000 });
    if (await trigger.getAttribute("aria-expanded") !== "true") throw new Error("Trigger did not expose the expanded state");
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden", timeout: 10000 });
    if (await trigger.getAttribute("aria-expanded") !== "false") throw new Error("Escape did not reset the expanded state");
    await trigger.click();
    await menu.waitFor({ state: "visible", timeout: 10000 });
    await page.locator("#main-content").click({ position: { x: 12, y: 12 } });
    await menu.waitFor({ state: "hidden", timeout: 10000 });
    return "Account popover opens, exposes aria-expanded, and closes on Escape and an outside click.";
  });

  await check("Sidebar keeps the active settings destination reachable", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/settings/payment`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const settingsGroup = page.locator('#main-navigation > div nav button[aria-controls^="sidebar-group-settings"]');
    await settingsGroup.waitFor({ timeout: 15000 });
    if (await settingsGroup.getAttribute("aria-expanded") !== "true") {
      throw new Error("Settings group did not auto-expand for the active payment page");
    }
    const paymentLink = page.locator('#main-navigation a[href="/settings/payment"]');
    await paymentLink.waitFor({ timeout: 10000 });
    await settingsGroup.click();
    if (await settingsGroup.getAttribute("aria-expanded") !== "false" || await paymentLink.isVisible()) {
      throw new Error("Active settings group could not be intentionally collapsed");
    }
    await page.goto(`${base}/overview`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.goto(`${base}/settings/payment`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => {
      const group = document.querySelector('#main-navigation button[aria-controls^="sidebar-group-settings"]');
      return group?.getAttribute("aria-expanded") === "true";
    }, null, { timeout: 15000 });
    return "The active Settings group expands on direct navigation, remains manually collapsible, and reopens when the route changes back to a settings child page.";
  });

  await check("Product search filters the Odoo catalogue", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/products/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const search = page.getByPlaceholder("Search product, barcode or SKU");
    await page.waitForFunction(() => {
      const cards = [...document.querySelectorAll("main section article")];
      const text = document.querySelector("main section")?.innerText ?? "";
      return cards.length > 0 && /SKU R2-/i.test(text);
    }, null, { timeout: 30000 });
    const table = page.locator("table");
    if (await table.evaluate((element) => getComputedStyle(element).display !== "none")) {
      throw new Error("The wide product table is visible at the mobile viewport");
    }
    const firstCard = page.locator("main section article").first();
    const sku = (await firstCard.innerText()).match(/SKU\s+(R2-[A-Za-z0-9-]+)/)?.[1];
    if (!sku) throw new Error("The R2 product card has no stable SKU for search testing");
    await search.fill(sku);
    await page.waitForFunction((expectedSku) => {
      const cards = [...document.querySelectorAll("main section article")];
      const text = document.querySelector("main section")?.innerText ?? "";
      return cards.length === 1 && text.includes(expectedSku);
    }, sku, { timeout: 30000 });
    await page.setViewportSize({ width: 1440, height: 900 });
    return "At 390px the R2 product cards replaced the wide table; searching a unique SKU returned one matching result.";
  });

  await check("Product edit dialog is prefilled from Odoo", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/products/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const search = page.getByPlaceholder("Search product, barcode or SKU");
    await page.locator("main section article").first().waitFor({ timeout: 30000 });
    const initialCard = page.locator("main section article").first();
    const sku = (await initialCard.innerText()).match(/SKU\s+(R2-[A-Za-z0-9-]+)/)?.[1];
    if (!sku) throw new Error("The R2 product card has no stable SKU for edit testing");
    await search.fill(sku);
    await page.waitForFunction((expectedSku) => {
      const cards = [...document.querySelectorAll("main section article")];
      return cards.length === 1 && (document.querySelector("main section")?.innerText ?? "").includes(expectedSku);
    }, sku, { timeout: 30000 });
    const card = page.locator("main section article").filter({ hasText: sku });
    await card.waitFor({ timeout: 15000 });
    const cardText = await card.innerText();
    const displayedPrice = Number(cardText.match(/\$([\d,]+\.\d{2})/)?.[1]?.replaceAll(",", ""));
    if (!Number.isFinite(displayedPrice) || displayedPrice <= 0) throw new Error("R2 test product does not show a valid Odoo price");
    await card.getByRole("button", { name: /Edit/i }).click();
    const dialog = page.getByRole("dialog", { name: "Edit product" });
    await dialog.waitFor({ timeout: 10000 });
    const dialogBox = await dialog.boundingBox();
    if (!dialogBox || dialogBox.width > 390 || dialogBox.height > 844) {
      throw new Error(`Product edit dialog exceeds the 390x844 viewport: ${JSON.stringify(dialogBox)}`);
    }
    const price = await page.getByLabel("Sale price").evaluate((input) => Number(input.value));
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Odoo sale price was not prefilled (received ${price})`);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    return "At 390px the edit dialog fit the viewport, prefilled a valid R2 Odoo price, and was closed without saving.";
  });

  await check("New product form blocks submission without a name", async () => {
    await page.goto(`${base}/products/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("button", { name: "New product" }).click();
    const dialog = page.getByRole("dialog", { name: "New product" });
    const name = dialog.getByLabel(/Product name/i);
    await name.waitFor({ timeout: 10000 });
    const blocked = await name.evaluate((input) => input.required && input.form?.checkValidity() === false);
    if (!blocked) throw new Error("An empty product form can pass browser validation");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await dialog.waitFor({ state: "detached", timeout: 10000 });
    return "Product name is required; empty form validation was checked and the dialog was cancelled without creating a product.";
  });

  await check("CSV product import previews valid rows without writing to Odoo", async () => {
    await page.goto(`${base}/products/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const writes = [];
    const onRequest = (request) => {
      if (request.method() === "POST" && /\/api\/odoo\/products(?:\/import)?(?:\?|$)/.test(new URL(request.url()).pathname)) {
        writes.push(request.url());
      }
    };
    page.on("request", onRequest);
    try {
      await page.getByRole("button", { name: "Import CSV" }).click();
      const dialog = page.getByRole("dialog", { name: "Import products from CSV" });
      await dialog.waitFor({ timeout: 10000 });
      await page.waitForFunction(() => {
        const input = document.querySelector('input[type="file"]');
        return Boolean(input && !input.disabled);
      }, null, { timeout: 15000 });
      await dialog.locator('input[type="file"]').setInputFiles({
        name: "preview-only.csv",
        mimeType: "text/csv",
        buffer: Buffer.from([
          "Product Name,SKU,Barcode,Sale Price,Cost",
          "Preview Only Shiraz,UAT-PREVIEW-001,,19.95,10.00",
          "",
        ].join("\n")),
      });
      await page.waitForFunction(() => document.body.innerText.includes("1 valid product ready to import"), null, { timeout: 10000 });
      const preview = await dialog.innerText();
      if (!preview.includes("Preview Only Shiraz") || !preview.includes("UAT-PREVIEW-001")) {
        throw new Error(`CSV preview did not show the parsed row: ${preview.slice(0, 500)}`);
      }
      if (writes.length) throw new Error("Selecting a CSV unexpectedly wrote products to Odoo");
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await dialog.waitFor({ state: "detached", timeout: 10000 });
      return "A valid one-row CSV was parsed and previewed; Cancel closed the dialog with no Odoo product write.";
    } finally {
      page.off("request", onRequest);
    }
  });

  await check("Customer creation form is required-field guarded", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/customers/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("button", { name: /New customer/i }).click();
    const dialog = page.getByRole("dialog", { name: "New customer" });
    const name = dialog.getByLabel(/Customer name/i);
    await name.waitFor({ timeout: 10000 });
    const dialogBox = await dialog.boundingBox();
    if (!dialogBox || dialogBox.width > 390 || dialogBox.height > 844) {
      throw new Error(`Customer creation dialog exceeds the 390x844 viewport: ${JSON.stringify(dialogBox)}`);
    }
    if (await name.getAttribute("required") === null) throw new Error("Customer name is not required");
    const emptyFormIsInvalid = await name.evaluate((input) => input.form?.checkValidity() === false);
    if (!emptyFormIsInvalid) throw new Error("An empty customer form passes browser validation");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    return "At 390px the customer dialog fit the viewport; Customer name is required and the empty form was cancelled without submission.";
  });

  await check("Customer mobile card and edit dialog render from a read-only fixture", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/odoo/records", async (route) => {
      const body = route.request().postDataJSON();
      if (body?.type !== "customers") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [{ id: 987654, name: "Pilot Fixture Customer", phone: "0400 123 456", email: "fixture@example.test", customer_rank: 1, ref: "PILOT-FIXTURE" }] }),
      });
    });
    try {
      await page.goto(`${base}/customers/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
      const card = page.locator("main section article").filter({ hasText: "Pilot Fixture Customer" });
      await card.waitFor({ timeout: 15000 });
      const table = page.locator("table");
      if (await table.evaluate((element) => getComputedStyle(element).display !== "none")) {
        throw new Error("The wide customer table is visible at the mobile viewport");
      }
      if (await card.getByRole("link", { name: /0400 123 456/ }).getAttribute("href") !== "tel:0400%20123%20456") {
        throw new Error("Customer phone card does not expose the expected tap-to-call link");
      }
      await card.getByRole("button", { name: "Edit", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Edit customer" });
      await dialog.waitFor({ timeout: 10000 });
      const dialogBox = await dialog.boundingBox();
      if (!dialogBox || dialogBox.width > 390 || dialogBox.height > 844) {
        throw new Error(`Customer edit dialog exceeds the 390x844 viewport: ${JSON.stringify(dialogBox)}`);
      }
      if (await dialog.getByLabel("Customer name").inputValue() !== "Pilot Fixture Customer") {
        throw new Error("Customer edit dialog did not prefill the fixture record");
      }
      await page.getByRole("button", { name: "Close", exact: true }).click();
      return "Mobile customer card showed Odoo fixture details and tap-to-call; edit dialog fit the viewport and was closed without saving.";
    } finally {
      await page.unroute("**/api/odoo/records");
    }
  });

  await check("Sales history searches and opens a refunded receipt", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/history/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const statusFilter = page.locator("label").filter({ hasText: "Filter sales by status" }).locator("select");
    await statusFilter.selectOption("refunded");
    const table = page.locator("table");
    const receipt = page.getByRole("button", { name: /^View receipt / }).first();
    await receipt.waitFor({ timeout: 30000 });
    if (await table.evaluate((element) => getComputedStyle(element).display !== "none")) {
      throw new Error("The wide sales table is visible at the mobile viewport");
    }
    await receipt.focus();
    await page.keyboard.press("Enter");
    const detail = page.getByRole("dialog", { name: /Sale receipt/i });
    await detail.waitFor({ timeout: 10000 });
    const dialogBox = await detail.boundingBox();
    if (!dialogBox || dialogBox.width > 390 || dialogBox.height > 844) {
      throw new Error(`Receipt dialog exceeds the 390x844 viewport: ${JSON.stringify(dialogBox)}`);
    }
    if (await detail.getByRole("button", { name: "Refund full sale" }).count()) {
      throw new Error("A refunded sale still exposes the full-refund action");
    }
    await page.getByRole("button", { name: "Close receipt" }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    return "At 390px the Refunded filter returned a mobile receipt card; the receipt dialog opened by keyboard, fit the viewport, and hid the duplicate full-refund action.";
  });

  await check("Replenishment coverage control refreshes the estimate", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/stock/replenishment`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const coverage = page.locator("#coverage-days");
    await coverage.waitFor({ timeout: 15000 });
    await coverage.selectOption("7");
    await page.getByText("Across a 7-day target", { exact: true }).waitFor({ timeout: 15000 });
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    if (dimensions.document > dimensions.viewport) throw new Error(`Mobile replenishment overflows horizontally: ${dimensions.document}px > ${dimensions.viewport}px`);
    if (await page.locator("main table").isVisible().catch(() => false)) throw new Error("Mobile replenishment should show product cards instead of the wide table");
    await page.getByRole("button", { name: "Show all products" }).click();
    await page.getByRole("heading", { name: "All POS products" }).waitFor({ timeout: 10000 });
    const productSection = page.locator("main section").filter({ has: page.getByRole("heading", { name: "All POS products" }) });
    if (!(await productSection.locator("article").count())) throw new Error("Mobile all-products view did not render product cards");
    const body = await page.locator("body").innerText();
    if (/No recent sales found/i.test(body) && !/Zero suggested orders does not mean stock is sufficient/i.test(body)) {
      throw new Error("No-sales warning does not explain that zero orders are not a stock sufficiency signal");
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    return `At 390px, replenishment showed product cards without overflow (${dimensions.document}px); coverage changed to 7 days; no-sales state remains explicitly qualified.`;
  });

  await check("Reporting period selector reloads Odoo dashboard", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/reports/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const range = page.locator("#dashboard-range");
    await range.waitFor({ timeout: 15000 });
    await page.getByRole("region", { name: "Sales summary" }).waitFor({ timeout: 30000 });
    const updatedRange = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/odoo/reporting-dashboard" && url.searchParams.get("hours") === "24" && response.ok();
    }, { timeout: 30000 });
    await range.selectOption("24");
    const rangeResponse = await updatedRange;
    const rangeData = await rangeResponse.json();
    await page.getByText(/Last 24 hours ·/).waitFor({ timeout: 15000 });
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    if (dimensions.document > dimensions.viewport) throw new Error(`Mobile reporting dashboard overflows horizontally: ${dimensions.document}px > ${dimensions.viewport}px`);
    const chartMarks = page.locator('[role="img"][aria-label]');
    if (rangeData.trend?.length) {
      if (await chartMarks.count() !== rangeData.trend.length) throw new Error("Reporting trend marks do not match the returned data");
    } else {
      if (Number(rangeData.transactions) !== 0 || Number(rangeData.refundTransactions) !== 0) {
        throw new Error("Reporting trend is empty despite sales or refunds in the selected period");
      }
      await page.getByText("No sales in this period", { exact: true }).waitFor({ timeout: 10000 });
    }
    const launcher = page.getByRole("button", { name: "Open Orithos AI assistant" });
    await launcher.waitFor({ timeout: 10000 });
    await launcher.click();
    await page.getByRole("dialog", { name: "Orithos AI assistant" }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Close assistant" }).click();
    return rangeData.trend?.length
      ? `At 390px there is no horizontal overflow (${dimensions.document}px); the 24-hour trend renders ${rangeData.trend.length} accessible marks, and the AI assistant opens/closes.`
      : `At 390px there is no horizontal overflow (${dimensions.document}px); the 24-hour Odoo report has no sales, so the qualified empty state renders, and the AI assistant opens/closes.`;
  });

  await check("Legacy report previews do not imply live Odoo data", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/reports/sales`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: "Sales report" }).waitFor({ timeout: 15000 });
    await page.getByRole("status").getByText("Static preview · no live Odoo data", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByText("No sample rows are available in this preview.", { exact: true }).waitFor({ timeout: 10000 });
    const misleadingTotals = await page.getByText(/\$0\.00|0\.00%/).count();
    if (misleadingTotals) throw new Error("Legacy report preview exposes placeholder monetary totals");
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    if (dimensions.document > dimensions.viewport) throw new Error(`Legacy report preview overflows horizontally: ${dimensions.document}px > ${dimensions.viewport}px`);
    return "At 390px the sales report clearly identifies itself as a static preview, displays no placeholder totals, and has no horizontal overflow.";
  });
} finally {
  try { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); } catch { /* Session expires normally. */ }
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  deployment: process.env.PILOT_DEPLOYMENT_SHA || execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  scope: "read-only production interactions; product/customer forms validated but not submitted; CSV parsed only in browser and cancelled; no product, customer, sale, refund, RFQ, or register-close writes",
  checks,
};
const outputPath = path.join(root, "docs", "UAT_INTERACTION_2026-10-14.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: checks.filter((item) => item.status === "PASS").length, failed: checks.filter((item) => item.status === "FAIL").length, checks }));
if (checks.some((item) => item.status === "FAIL")) process.exitCode = 2;
