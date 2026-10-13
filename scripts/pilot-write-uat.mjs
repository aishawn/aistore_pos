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

const base = "https://app.orithos.com.au";
const password = env.INITIAL_ADMIN_PASSWORD;

async function login(page) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByPlaceholder("Username").fill("admin");
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30000 });
}

async function waitForTotal(page, amount) {
  await page.waitForFunction(
    (expected) => document.body.innerText.replace(/\s+/g, " ").includes(expected),
    amount,
    { timeout: 20000 },
  );
}

async function sellOne(page, productNameRegex, paymentLabel, expectedTotal) {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: productNameRegex }).first().click();
  await waitForTotal(page, expectedTotal);
  await page.locator("select").filter({ has: page.locator(`option:text-is("${paymentLabel}")`) }).first().selectOption({ label: paymentLabel });
  await page.waitForTimeout(800);
  if (paymentLabel === "Cash") {
    const cash = page.locator("#cash-tendered");
    if (await cash.count()) {
      await cash.fill(expectedTotal.replace("$", ""));
    }
  }
  const finalise = page.getByRole("button", { name: "Finalise" });
  await finalise.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === "Finalise");
    return Boolean(button && !button.disabled);
  }, null, { timeout: 20000 });
  await finalise.click();
  await page.getByRole("heading", { name: /Sale complete/i }).waitFor({ timeout: 30000 });
  const text = await page.locator("body").innerText();
  await page.getByRole("button", { name: /New sale/i }).click().catch(async () => {
    await page.getByRole("button", { name: /Close receipt/i }).click();
  });
  return text.replace(/\s+/g, " ").slice(0, 500);
}

async function refundByReceipt(page, receiptId) {
  await page.goto(`${base}/history/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: receiptId }).click();
  await page.getByRole("heading", { name: /Sale receipt/i }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /Refund full sale/i }).click();
  await page.getByRole("heading", { name: /Confirm full refund/i }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: /Record full refund/i }).click();
  await page.waitForFunction(
    () => /Refund recorded|already been refunded|Refund failed/i.test(document.body.innerText),
    null,
    { timeout: 30000 },
  );
  const text = await page.locator("body").innerText();
  await page.getByRole("button", { name: /^Close$/i }).click().catch(() => {});
  return text.replace(/\s+/g, " ").slice(0, 500);
}

async function apiState(context) {
  const session = await context.request.get(`${base}/api/odoo/session`);
  const sessionJson = await session.json();
  const products = await context.request.post(`${base}/api/odoo/records`, {
    data: { type: "products", limit: 40 },
    headers: { Origin: base },
  });
  const productsJson = await products.json();
  const sales = await context.request.post(`${base}/api/odoo/records`, {
    data: { type: "sales", limit: 20 },
    headers: { Origin: base },
  });
  const salesJson = await sales.json();
  const boot = await context.request.get(`${base}/api/odoo/pos-bootstrap`);
  const bootJson = await boot.json();
  return {
    autoRecoverConfigured: sessionJson.autoRecoverConfigured,
    session: bootJson.configs?.[0]?.session?.name,
    sessionState: bootJson.configs?.[0]?.session?.state,
    products: (productsJson.items || []).map((p) => ({
      code: p.default_code,
      free: p.free_qty,
      onhand: p.qty_available,
    })),
    recentSales: (salesJson.items || []).slice(0, 6).map((s) => ({
      name: s.name,
      amount: s.amount_total,
      state: s.state,
    })),
  };
}

// Cleanup pilot roles left from earlier UAT
async function cleanupRoles(context) {
  const rolesRes = await context.request.get(`${base}/api/roles`);
  const rolesJson = await rolesRes.json();
  const roles = rolesJson.data || [];
  const cleaned = [];
  for (const role of roles) {
    if (String(role.name || "").startsWith("Pilot Clerk")) {
      const del = await context.request.delete(`${base}/api/roles/${role.id}`);
      const delJson = await del.json().catch(() => ({}));
      cleaned.push({ id: role.id, name: role.name, code: delJson.code, message: delJson.message });
    }
  }
  return cleaned;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await login(page);

const before = await apiState(context);
console.log("BEFORE", JSON.stringify(before));

const cleanedFirst = await cleanupRoles(context);
console.log("ROLE_CLEANUP_PRE", JSON.stringify(cleanedFirst));

const cardReceipt = await sellOne(
  page,
  /Adelaide Hills Sauvignon Blanc 2024/,
  "Card",
  "$28.60",
);
console.log("CARD_SELL", cardReceipt.slice(0, 240));

const cashReceipt = await sellOne(
  page,
  /Barossa Shiraz 2021/,
  "Cash",
  "$38.39",
);
console.log("CASH_SELL", cashReceipt.slice(0, 240));

const mid = await apiState(context);
console.log("MID", JSON.stringify(mid));

// Refund only this round's sales (000010 cash, 000009 card) if present; otherwise refund newest paid positives.
const historyText = await (async () => {
  await page.goto(`${base}/history/odoo`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  return page.locator("body").innerText();
})();
const cashReceiptId = historyText.match(/260-1-000010/) ? "260-1-000010" : null;
const cardReceiptId = historyText.match(/260-1-000009/) ? "260-1-000009" : null;
if (!cashReceiptId || !cardReceiptId) throw new Error(`Missing this-round receipts in history: ${historyText.slice(0, 300)}`);

const refund1 = await refundByReceipt(page, cashReceiptId);
console.log("REFUND1", refund1.slice(0, 240));
const refund2 = await refundByReceipt(page, cardReceiptId);
console.log("REFUND2", refund2.slice(0, 240));

const after = await apiState(context);
console.log("AFTER", JSON.stringify(after));

const cleaned = await cleanupRoles(context);
console.log("ROLE_CLEANUP", JSON.stringify(cleaned));

const report = {
  generatedAt: new Date().toISOString(),
  before,
  mid,
  after,
  cleaned,
  cardReceipt: cardReceipt.slice(0, 400),
  cashReceipt: cashReceipt.slice(0, 400),
  refund1: refund1.slice(0, 400),
  refund2: refund2.slice(0, 400),
  receipts: { cashReceiptId, cardReceiptId },
};
fs.writeFileSync(path.join(root, "docs", "UAT_WRITE_2026-10-13.json"), JSON.stringify(report, null, 2));
await browser.close();

const sb = after.products.find((p) => p.code === "DEMO-SB-2024");
const sh = after.products.find((p) => p.code === "DEMO-SHIRAZ21");
const ok = sb?.free === 12 && sh?.free === 12;
console.log(ok ? "WRITE_UAT_OK" : "WRITE_UAT_STOCK_MISMATCH");
process.exit(ok ? 0 : 3);
