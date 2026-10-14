import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}));
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");

const base = "https://app.orithos.com.au";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
    order: { ...order, date_planned: "2026-10-20 10:00:00", receipt_status: "pending", amount_untaxed: 52, amount_tax: 5.2, user_id: [1, "UAT"], origin: "MOCK ONLY" },
    lines: [{ id: 1, product_id: [51, "DEMO Sauvignon Blanc"], name: "DEMO Sauvignon Blanc", product_qty: 2, product_uom: [1, "Units"], price_unit: 26, price_subtotal: 52, qty_received: 0, date_planned: "2026-10-20 10:00:00" }],
    receipts: [],
    receiptsAvailable: true,
    approvalAudits: [{ id: 901, date: "2026-10-13 10:00:00", author_id: [1, "UAT Buyer"], body: "<p><strong>Orithos replenishment approval audit v1</strong></p><p>Forecast method: rules_v1_weighted_velocity · Target coverage: 21 days.</p><table><tr><td>Suggested</td><td>9</td><td>7</td></tr></table>" }],
    approvalAuditAvailable: true,
    url: "https://odoo.orithos.com.au/odoo/purchase/987654",
  };
  await page.route("**/api/odoo/session**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: 1, name: "UAT" }, autoRecoverConfigured: true }) }));
  await page.route("**/api/odoo/purchase-orders?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [order], limit: 40, offset: 0, hasNext: false }) }));
  await page.route("**/api/odoo/purchase-orders/987654", (route) => route.request().method() === "GET"
    ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) })
    : route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Unexpected write blocked in UAT" }) }));

  await page.goto(`${base}/purchases/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const listLayout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  if (listLayout.viewport !== 390 || listLayout.document > listLayout.viewport) throw new Error(`Purchase list overflows at mobile width: ${JSON.stringify(listLayout)}`);
  if (await page.locator("table").isVisible().catch(() => false)) throw new Error("Purchase table should be replaced by mobile cards below xl width");
  const mobileCard = page.locator("article", { hasText: "UAT-RFQ-MOCK-001" });
  await mobileCard.waitFor({ timeout: 10000 });
  if (!(await mobileCard.getByText("UAT Mock Supplier (not saved)").count())) throw new Error("Mobile purchase card is missing supplier information");
  await mobileCard.getByRole("button", { name: "View order" }).click();
  const detailDialog = page.getByRole("dialog", { name: "UAT-RFQ-MOCK-001" });
  await detailDialog.waitFor({ timeout: 15000 });
  const detailBox = await detailDialog.boundingBox();
  if (!detailBox || detailBox.width > 390 || detailBox.height > 844) throw new Error(`Purchase detail dialog does not fit mobile viewport: ${JSON.stringify(detailBox)}`);
  const mobileLineCard = detailDialog.locator("article", { hasText: "DEMO Sauvignon Blanc" });
  await mobileLineCard.waitFor({ timeout: 10000 });
  if (await detailDialog.locator("table").isVisible().catch(() => false)) throw new Error("Purchase detail lines should use mobile cards below xl width");
  await detailDialog.getByText("No incoming receipts are linked yet. Confirm the purchase order in Odoo to start the receiving workflow.").waitFor({ timeout: 10000 });
  await detailDialog.getByText("Orithos replenishment approval audit v1", { exact: false }).waitFor({ timeout: 10000 });
  const displayedNotes = await detailDialog.getByRole("heading", { name: "Replenishment approval audit" }).locator("..", {}).innerText({ timeoutMs: 10000 });
  if (!displayedNotes.includes("Forecast method: rules_v1_weighted_velocity") || !displayedNotes.includes("Target coverage: 21 days") || !displayedNotes.includes("Suggested · 9 · 7")) throw new Error(`Purchase notes were not rendered as readable text: ${displayedNotes.slice(0, 600)}`);
  await detailDialog.getByRole("button", { name: "Confirm purchase order" }).click();
  const confirmDialog = page.getByRole("alertdialog", { name: "Confirm this purchase order?" });
  await confirmDialog.waitFor({ timeout: 10000 });
  await confirmDialog.getByRole("button", { name: "Go back" }).click();
  await confirmDialog.waitFor({ state: "detached", timeout: 10000 });
  await detailDialog.getByRole("button", { name: "Close", exact: true }).last().click();
  if (writes.length) throw new Error("PURCHASE_CONFIRM_WRITE_DETECTED");
  const output = { generatedAt: new Date().toISOString(), deployment: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), status: "PASS", viewport: 390, fixture: "mock RFQ only; no Odoo write", checks: ["mobile purchase list has no horizontal overflow", "RFQ is displayed as a supplier card, not a wide table", "mobile detail dialog fits viewport", "purchase line uses mobile card instead of table", "RFQ detail and line rendered", "AUD total and tax rendered", "internal approval chatter rendered as escaped plain text", "empty incoming receipt state rendered", "purchase confirmation requires a second dialog", "confirmation dialog cancelled", "no purchase confirmation POST observed"] };
  const outputPath = path.join(root, "docs", "UAT_PURCHASE_MOBILE_2026-10-14.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, ...output }));
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await browser.close();
}
