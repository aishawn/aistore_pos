/**
 * One MOCK sell → full refund on demo. Does NOT close the register.
 * Waits for Odoo auto-recover, then sells the first in-stock product under $40 (price_included).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const base = process.env.PILOT_BASE_URL || "https://demo.orithos.com.au";
const password = process.env.INITIAL_ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD;
if (!password) {
  console.error("INITIAL_ADMIN_PASSWORD missing");
  process.exit(2);
}

function money(amount) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);
}

async function login(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByPlaceholder("Username").fill("admin");
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: "Login" }).click();
    try {
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 45000 });
      return;
    } catch {
      await page.waitForTimeout(1500);
    }
  }
  throw new Error("Login failed after retries");
}

async function ensureOdooSession(page, context) {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  for (let i = 0; i < 30; i += 1) {
    const session = await context.request.get(`${base}/api/odoo/session`);
    const json = await session.json().catch(() => ({}));
    if (json?.user?.id) return json;
    await page.waitForTimeout(1000);
  }
  throw new Error("Odoo session did not auto-recover");
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await login(page);
const sessionInfo = await ensureOdooSession(page, context);

const productsRes = await context.request.post(`${base}/api/odoo/records`, {
  data: { type: "products", limit: 80 },
  headers: { Origin: base },
});
const productsJson = await productsRes.json();
const items = productsJson.items || [];
const product = items.find((p) => {
  const price = Number(p.price_included ?? p.lst_price ?? p.list_price ?? 0);
  const qty = Number(p.free_qty ?? p.qty_available ?? 0);
  return p.available_in_pos !== false && price > 0 && price < 40 && qty > 0;
});
if (!product) {
  console.error("No sellable product under $40 with stock", { count: items.length });
  await browser.close();
  process.exit(3);
}

const rawName = String(product.name || product.display_name);
const barcode = String(product.barcode || "").trim();
const searchToken = barcode || product.default_code || rawName.slice(0, 24);
const buttonNeedle = rawName
  .replace(/^\[[^\]]+\]\s*/u, "")
  .replace(/\s+/g, " ")
  .trim();
const expectedTotal = money(Number(product.price_included ?? product.list_price));
const beforeQty = Number(product.free_qty ?? product.qty_available ?? 0);

await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.getByLabel("Search products by name, barcode or code").fill(searchToken);
await page.waitForTimeout(2500);
const productButton = page.locator("button").filter({ hasText: expectedTotal }).filter({ hasText: /avail\./i }).first();
await productButton.click({ timeout: 25000 });
await page.waitForFunction(
  (expected) => document.body.innerText.replace(/\s+/g, " ").includes(expected),
  expectedTotal,
  { timeout: 20000 },
);

const paySelect = page.locator("select").filter({ has: page.locator("option") }).first();
const optionValue = await paySelect.locator("option").evaluateAll((opts) => {
  const hit = opts.find((o) => /card|credit|eftpos/i.test(o.textContent || ""));
  return hit?.value || opts.find((o) => o.value)?.value || "";
});
if (optionValue) await paySelect.selectOption(optionValue);
await page.waitForTimeout(600);

const finalise = page.getByRole("button", { name: "Finalise" });
await finalise.waitFor({ state: "visible" });
await page.waitForFunction(() => {
  const button = [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === "Finalise");
  return Boolean(button && !button.disabled);
}, null, { timeout: 20000 });
await finalise.click();
await page.getByRole("heading", { name: /Sale complete/i }).waitFor({ timeout: 45000 });
const receiptBody = await page.locator("body").innerText();
const receiptMatch = receiptBody.match(/\b\d{2,3}-\d-\d{6}\b/);
const receiptId = receiptMatch?.[0] || null;
await page.getByRole("button", { name: /New sale|Close receipt/i }).first().click().catch(() => {});

if (!receiptId) {
  console.error("Could not parse receipt id");
  await browser.close();
  process.exit(4);
}

await page.goto(`${base}/history/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
await page.getByRole("button", { name: receiptId }).first().click();
await page.getByRole("heading", { name: /Sale receipt/i }).waitFor({ timeout: 15000 });
await page.getByRole("button", { name: /Refund full sale/i }).click();
await page.getByRole("heading", { name: /Confirm full refund/i }).waitFor({ timeout: 10000 });
await page.getByRole("button", { name: /Record full refund/i }).click();
await page.waitForFunction(
  () => /Refund recorded|already been refunded|Refund failed/i.test(document.body.innerText),
  null,
  { timeout: 45000 },
);
const refundText = await page.locator("body").innerText();
const refundOk = /Refund recorded|already been refunded/i.test(refundText);

const afterProducts = await context.request.post(`${base}/api/odoo/records`, {
  data: { type: "products", limit: 80 },
  headers: { Origin: base },
});
const afterJson = await afterProducts.json();
const afterProduct = (afterJson.items || []).find((p) => p.id === product.id) || {};
const afterQty = Number(afterProduct.free_qty ?? afterProduct.qty_available ?? beforeQty);

const report = {
  generatedAt: new Date().toISOString(),
  result: refundOk ? "pass" : "fail",
  base,
  sessionNote: "Did not close register",
  odooUser: sessionInfo?.user?.username || null,
  product: {
    id: product.id,
    code: product.default_code,
    name: buttonNeedle,
    price: expectedTotal,
    beforeQty,
    afterQty,
  },
  receiptId,
  refundSnippet: refundText.replace(/\s+/g, " ").slice(0, 400),
};
const out = path.join(root, "docs", "UAT_MOCK_SELL_REFUND_2026-10-16.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
process.exit(refundOk ? 0 : 5);
