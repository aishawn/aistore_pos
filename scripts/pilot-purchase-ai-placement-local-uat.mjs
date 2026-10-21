/** Check that the purchase detail action remains usable without a floating AI overlay. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
if (!new URL(base).hostname.endsWith(".localhost") && new URL(base).hostname !== "localhost") throw new Error("LOCAL_FIXTURE_TARGET_REQUIRED");
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_PURCHASE_AI_PLACEMENT_LOCAL.json");
const screenshotDir = path.resolve(root, process.env.PILOT_UAT_SCREENSHOT_DIR ?? "docs/screenshots/2026-10-21-purchase-ai-placement");
fs.mkdirSync(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [];
for (const width of [390, 1024, 1440]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
  await context.addInitScript(() => localStorage.setItem("sf_user", JSON.stringify({ id: 1, username: "admin", name: "Fixture Admin", isAdmin: true })));
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() !== "GET") return route.fulfill({ status: 405, json: { code: 40500, message: "Writes blocked", data: null } });
    if (pathname === "/api/odoo/session") return route.fulfill({ json: { user: { id: 1, name: "Fixture", username: "admin" } } });
    if (pathname === "/api/odoo/pos-bootstrap") return route.fulfill({ json: { configs: [] } });
    if (pathname === "/api/odoo/purchase-orders") return route.fulfill({ json: { items: [{ id: 987654, name: "FIXTURE-PO-001", partner_id: [77, "Fixture supplier"], date_order: "2026-10-21 02:00:00", state: "purchase", amount_total: 22, currency_id: [1, "AUD"], company_id: [1, "Fixture"], order_line: [1] }], hasNext: false, limit: 40, offset: 0 } });
    if (pathname === "/api/odoo/purchase-orders/987654") return route.fulfill({ json: { order: { id: 987654, name: "FIXTURE-PO-001", partner_id: [77, "Fixture supplier"], date_order: "2026-10-21 02:00:00", state: "purchase", amount_total: 22, amount_untaxed: 20, amount_tax: 2, currency_id: [1, "AUD"], company_id: [1, "Fixture"], order_line: [1], receipt_status: "pending" }, lines: [], receipts: [], receiptsAvailable: true, approvalAudits: [], approvalAuditAvailable: true, url: "https://example.invalid/fixture", receivable: { pickingId: 71, pickingName: "FIXTURE/IN/001", moves: [{ id: 81, product_id: [51, "Fixture wine"], product_uom_qty: 2, qty_done: 0, remaining: 2 }] } } });
    return route.fulfill({ json: { code: 0, data: [] } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${base}/purchases/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("button", { name: "FIXTURE-PO-001", exact: true }).waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "FIXTURE-PO-001", exact: true }).click();
    await page.getByRole("dialog", { name: "FIXTURE-PO-001", exact: true }).waitFor();
    const header = await page.getByRole("button", { name: "Open Orithos AI assistant", exact: true }).count();
    const floating = await page.getByRole("button", { name: "Open Orithos AI", exact: true }).count();
    const receive = await page.getByRole("button", { name: "Receive stock", exact: true }).isVisible();
    checks.push({ viewport: width, actualViewport: await page.evaluate(() => innerWidth), name: "purchase detail has header AI and unobstructed receive action", status: header === 1 && floating === 0 && receive && errors.length === 0 ? "PASS" : "FAIL", header, floating, receive, errors });
    await page.screenshot({ path: path.join(screenshotDir, `purchase-${width}.png`), fullPage: true });
  } catch (error) { checks.push({ viewport: width, name: "purchase placement run", status: "FAIL", evidence: error instanceof Error ? error.message : "Unexpected failure", errors }); }
  finally { await context.close(); }
}
await browser.close();
const output = { generatedAt: new Date().toISOString(), sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), target: base, scope: "Local fixture only; purchase detail read and AI placement, no business writes", status: checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL", checks };
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length }));
if (output.status !== "PASS") process.exitCode = 1;
