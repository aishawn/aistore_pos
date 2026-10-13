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

  await check("Product search filters the Odoo catalogue", async () => {
    await page.goto(`${base}/products/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const search = page.getByPlaceholder("Search product, barcode or SKU");
    await search.fill("shiraz");
    await page.getByText(/Barossa Shiraz 2021/i).waitFor({ timeout: 15000 });
    await page.getByText("Showing 1–1", { exact: true }).waitFor({ timeout: 15000 });
    if (await page.getByText(/Sauvignon Blanc/i).count()) throw new Error("Non-matching catalogue product remained visible");
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
    await page.getByRole("heading", { name: /Sale receipt/i }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Close receipt" }).click();
    return "Receipt search matched `260-1-000009`; detail opened and closed without a refund action.";
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
  scope: "read-only production interactions; customer form opened but not submitted; no sale, refund, RFQ, or register-close writes",
  checks,
};
const outputPath = path.join(root, "docs", "UAT_INTERACTION_2026-10-13.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: checks.filter((item) => item.status === "PASS").length, failed: checks.filter((item) => item.status === "FAIL").length, checks }));
if (checks.some((item) => item.status === "FAIL")) process.exitCode = 2;
