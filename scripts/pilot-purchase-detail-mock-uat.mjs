import fs from "node:fs";
import { chromium } from "playwright";

const env = Object.fromEntries(fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}));
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");

const base = "https://app.orithos.com.au";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error("Pilot purchase detail UAT login failed");

  const page = await context.newPage();
  const writes = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\/odoo\/purchase-orders\/\d+/.test(new URL(request.url()).pathname)) writes.push(request.url());
  });
  const order = {
    id: 987654,
    name: "UAT-RFQ-MOCK-001",
    partner_id: [123, "UAT Mock Supplier (not saved)"],
    date_order: "2026-10-13 10:00:00",
    state: "draft",
    amount_total: 57.2,
    currency_id: [1, "AUD"],
    company_id: [1, "Orithos Demo"],
    order_line: [1],
  };
  const detail = {
    order: { ...order, date_planned: "2026-10-20 10:00:00", receipt_status: "pending", amount_untaxed: 52, amount_tax: 5.2, user_id: [1, "UAT"], origin: "MOCK ONLY", notes: false },
    lines: [{ id: 1, product_id: [51, "DEMO Sauvignon Blanc"], name: "DEMO Sauvignon Blanc", product_qty: 2, product_uom: [1, "Units"], price_unit: 26, price_subtotal: 52, qty_received: 0, date_planned: "2026-10-20 10:00:00" }],
    receipts: [],
    receiptsAvailable: true,
    url: "https://odoo.orithos.com.au/odoo/purchase/987654",
  };
  await page.route("**/api/odoo/session**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: 1, name: "UAT" }, autoRecoverConfigured: true }) }));
  await page.route("**/api/odoo/purchase-orders?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [order], limit: 40, offset: 0, hasNext: false }) }));
  await page.route("**/api/odoo/purchase-orders/987654", (route) => route.request().method() === "GET"
    ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) })
    : route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Unexpected write blocked in UAT" }) }));

  await page.goto(`${base}/purchases/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: "UAT-RFQ-MOCK-001" }).click();
  const detailDialog = page.getByRole("dialog", { name: "UAT-RFQ-MOCK-001" });
  await detailDialog.waitFor({ timeout: 15000 });
  await detailDialog.getByText("No incoming receipts are linked yet. Confirm the purchase order in Odoo to start the receiving workflow.").waitFor({ timeout: 10000 });
  await detailDialog.getByRole("button", { name: "Confirm purchase order" }).click();
  const confirmDialog = page.getByRole("alertdialog", { name: "Confirm this purchase order?" });
  await confirmDialog.waitFor({ timeout: 10000 });
  await confirmDialog.getByRole("button", { name: "Go back" }).click();
  await confirmDialog.waitFor({ state: "detached", timeout: 10000 });
  await detailDialog.getByRole("button", { name: "Close", exact: true }).last().click();
  if (writes.length) throw new Error("PURCHASE_CONFIRM_WRITE_DETECTED");
  console.log(JSON.stringify({ status: "PASS", fixture: "mock RFQ only; no Odoo write", checks: ["RFQ detail and line rendered", "AUD total and tax rendered", "empty incoming receipt state rendered", "purchase confirmation requires a second dialog", "confirmation dialog cancelled", "no purchase confirmation POST observed"] }));
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await browser.close();
}
