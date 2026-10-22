import fs from "node:fs";
import { chromium } from "playwright";

const env = Object.fromEntries(fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}));
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");

const base = "https://demo.orithos.com.au";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error("Pilot replenishment audit UAT login failed");

  const page = await context.newPage();
  let submittedAudit;
  await page.route("**/api/odoo/session**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: 1, name: "UAT" }, autoRecoverConfigured: true }) }));
  await page.route("**/api/odoo/replenishment?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    company: "Orithos Demo",
    historyDays: 56,
    periodDays: 28,
    coverageDays: 21,
    products: [
      { id: 481, name: "UAT DEMO Shiraz", sku: "UAT-481", unit: "Units", soldUnits: 42, recentUnits: 24, previousUnits: 18, unitsPerDay: 0.79, trendPercent: 33, trend: "up", onHand: 8, forecastStock: 8, daysOfStock: 10, suggestedQuantity: 9, reason: "Test forecast reason: demand and stock coverage.", reasonParts: ["Test forecast reason: demand and stock coverage."], method: "rules_v1_weighted_velocity" },
      { id: 482, name: "UAT DEMO Chardonnay", sku: "UAT-482", unit: "Units", soldUnits: 14, recentUnits: 8, previousUnits: 6, unitsPerDay: 0.26, trendPercent: 33, trend: "up", onHand: 4, forecastStock: 4, daysOfStock: 15, suggestedQuantity: 4, reason: "Second test line reason.", reasonParts: ["Second test line reason."], method: "rules_v1_weighted_velocity" },
    ],
    truncated: false,
    generatedAt: new Date().toISOString(),
  }) }));
  await page.route("**/api/odoo/purchase-requests", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suppliers: [{ id: 77, name: "UAT Supplier (mock)", email: "uat@example.invalid" }] }) });
    submittedAudit = route.request().postDataJSON();
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: 887766, name: "UAT-RFQ-MOCK-002", supplier: "UAT Supplier (mock)", url: "https://odoo.orithos.com.au/web#id=887766&model=purchase.order&view_type=form", auditSaved: true }) });
  });

  await page.goto(`${base}/stock/replenishment`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: "Replenishment" }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: /Create draft RFQ/ }).click();
  const dialog = page.getByRole("dialog", { name: "Review draft RFQ" });
  await dialog.waitFor({ timeout: 10000 });
  await dialog.getByLabel("Order quantity").nth(0).fill("100001");
  await dialog.getByRole("button", { name: "Create draft RFQ" }).click();
  await dialog.getByRole("alert").filter({ hasText: "100,000" }).waitFor({ timeout: 5000 });
  if (submittedAudit) throw new Error("Over-limit RFQ quantity unexpectedly submitted");
  await dialog.getByLabel("Order quantity").nth(0).fill("7");
  await dialog.getByLabel("Order quantity").nth(1).fill("0");
  await dialog.getByRole("button", { name: "Create draft RFQ" }).click();
  await page.getByText("UAT-RFQ-MOCK-002", { exact: true }).first().waitFor({ timeout: 10000 });
  await page.getByText("Internal approval audit saved to Odoo chatter.", { exact: false }).waitFor({ timeout: 10000 });

  if (!submittedAudit || submittedAudit.supplierId !== 77 || submittedAudit.coverageDays !== 21 || submittedAudit.method !== "rules_v1_weighted_velocity") throw new Error(`Approval snapshot metadata was not submitted: ${JSON.stringify(submittedAudit)}`);
  const [line] = submittedAudit.lines ?? [];
  const unselectedLine = submittedAudit.lines?.[1];
  if (submittedAudit.lines?.length !== 2 || line.productId !== 481 || line.suggestedQuantity !== 9 || line.quantity !== 7 || line.reason !== "Test forecast reason: demand and stock coverage." || unselectedLine.productId !== 482 || unselectedLine.suggestedQuantity !== 4 || unselectedLine.quantity !== 0) throw new Error("Suggested versus approved quantity, including a removed line, was not preserved");

  console.log(JSON.stringify({ status: "PASS", fixture: "intercepted in-memory RFQ; no Odoo write", checks: ["draft RFQ review required supplier selection", "quantity edits retained beside original suggestions", "zeroed line retained in audit without being ordered", "coverage and forecast method included", "reasons included in approval snapshot", "mock RFQ success shown"] }));
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await browser.close();
}
