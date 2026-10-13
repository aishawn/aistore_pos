import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
const base = "https://app.orithos.com.au";
const password = env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const checks = [];

async function check(name, run) {
  try {
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
    await trigger.click();
    if (await trigger.getAttribute("aria-expanded") !== "true" || await navigation.getAttribute("aria-hidden") !== "false") {
      throw new Error("Mobile navigation did not expose its expanded state");
    }
    await page.keyboard.press("Escape");
    if (await trigger.getAttribute("aria-expanded") !== "false" || await navigation.getAttribute("aria-hidden") !== "true") {
      throw new Error("Escape did not close the mobile navigation");
    }
    await trigger.click();
    await backdrop.click({ position: { x: 350, y: 100 } });
    if (await trigger.getAttribute("aria-expanded") !== "false") throw new Error("Outside click did not close the mobile navigation");
    await page.setViewportSize({ width: 1440, height: 900 });
    return "At 390px, the navigation drawer opens and closes with Escape and the outside backdrop; ARIA state tracks visibility.";
  });

  await check("Compact account popover opens and closes accessibly", async () => {
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
    await page.locator("main").click({ position: { x: 12, y: 12 } });
    await menu.waitFor({ state: "hidden", timeout: 10000 });
    return "Account popover opens, exposes aria-expanded, and closes on Escape and an outside click.";
  });

  await check("Product search filters the Odoo catalogue", async () => {
    await page.goto(`${base}/products/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const search = page.getByPlaceholder("Search product, barcode or SKU");
    await page.waitForFunction(() => {
      const rows = [...(document.querySelector("tbody")?.querySelectorAll("tr") ?? [])];
      const text = document.querySelector("tbody")?.innerText ?? "";
      return rows.length === 2 && /Barossa Shiraz/i.test(text) && /Sauvignon Blanc/i.test(text);
    }, null, { timeout: 30000 });
    await search.fill("shiraz");
    await page.waitForFunction(() => {
      const rows = [...(document.querySelector("tbody")?.querySelectorAll("tr") ?? [])];
      const text = document.querySelector("tbody")?.innerText ?? "";
      return rows.length === 1 && /Barossa Shiraz/i.test(text) && !/Sauvignon Blanc/i.test(text);
    }, null, { timeout: 30000 });
    return "Search `shiraz` returned Barossa Shiraz only.";
  });

  await check("Product edit dialog is prefilled from Odoo", async () => {
    await page.goto(`${base}/products/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const row = page.getByRole("row").filter({ hasText: "Barossa Shiraz 2021" });
    await row.getByRole("button", { name: /Edit.*Barossa Shiraz 2021/i }).click();
    await page.getByRole("heading", { name: "Edit product" }).waitFor({ timeout: 10000 });
    const price = await page.getByLabel("Sale price").evaluate((input) => Number(input.value));
    if (price !== 34.9) throw new Error(`Odoo sale price was not prefilled (received ${price})`);
    await page.getByRole("button", { name: "Close" }).click();
    return "Barossa Shiraz edit dialog showed the Odoo sale price 34.90 and was closed without saving.";
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
    await page.goto(`${base}/customers/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("button", { name: /New customer/i }).click();
    const name = page.getByLabel(/Customer name/i);
    await name.waitFor({ timeout: 10000 });
    if (await name.getAttribute("required") === null) throw new Error("Customer name is not required");
    const emptyFormIsInvalid = await name.evaluate((input) => input.form?.checkValidity() === false);
    if (!emptyFormIsInvalid) throw new Error("An empty customer form passes browser validation");
    await page.getByRole("button", { name: "Close" }).click();
    return "Customer name is required; an empty form fails browser validation and was not submitted.";
  });

  await check("Sales history searches and opens a refunded receipt", async () => {
    await page.goto(`${base}/history/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const search = page.getByPlaceholder("Search receipt or order reference");
    await search.fill("260-1-000009");
    const receipt = page.getByRole("button", { name: /260-1-000009/ });
    await receipt.waitFor({ timeout: 15000 });
    await receipt.click();
    const detail = page.getByRole("dialog", { name: /Sale receipt/i });
    await detail.waitFor({ timeout: 10000 });
    await detail.getByRole("status").filter({ hasText: /refund has already been recorded/i }).waitFor({ timeout: 10000 });
    if (await detail.getByRole("button", { name: "Refund full sale" }).count()) {
      throw new Error("A previously refunded sale still exposes the full-refund action");
    }
    await page.getByRole("button", { name: "Close receipt" }).click();
    return "Receipt search matched `260-1-000009`; detail identified the prior refund and hid the duplicate full-refund action.";
  });

  await check("Replenishment coverage control refreshes the estimate", async () => {
    await page.goto(`${base}/stock/replenishment`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const coverage = page.locator("#coverage-days");
    await coverage.waitFor({ timeout: 15000 });
    await coverage.selectOption("7");
    await page.getByText("Across a 7-day target", { exact: true }).waitFor({ timeout: 15000 });
    const body = await page.locator("body").innerText();
    if (/No recent sales found/i.test(body) && !/Zero suggested orders does not mean stock is sufficient/i.test(body)) {
      throw new Error("No-sales warning does not explain that zero orders are not a stock sufficiency signal");
    }
    return "Coverage changed to 7 days; no-sales state remains explicitly qualified.";
  });

  await check("Reporting period selector reloads Odoo dashboard", async () => {
    await page.goto(`${base}/reports/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const range = page.locator("#dashboard-range");
    await range.waitFor({ timeout: 15000 });
    await range.selectOption("24");
    await page.getByText(/Last 24 hours ·/).waitFor({ timeout: 15000 });
    return "Dashboard changed to the 24-hour Odoo reporting window.";
  });
} finally {
  try { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); } catch { /* Session expires normally. */ }
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  scope: "read-only production interactions; product/customer forms validated but not submitted; CSV parsed only in browser and cancelled; no product, customer, sale, refund, RFQ, or register-close writes",
  checks,
};
const outputPath = path.join(root, "docs", "UAT_INTERACTION_2026-10-13.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: checks.filter((item) => item.status === "PASS").length, failed: checks.filter((item) => item.status === "FAIL").length, checks }));
if (checks.some((item) => item.status === "FAIL")) process.exitCode = 2;
