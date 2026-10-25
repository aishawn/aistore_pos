/** Purchase confirmation/receipt UI under delayed responses; every API is a local fixture. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
if (!new URL(base).hostname.endsWith(".localhost")) throw new Error("LOCAL_TENANT_FIXTURE_TARGET_REQUIRED");
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_PURCHASE_BUSY_LOCAL_CURRENT.json");
const screenshotDir = path.resolve(root, process.env.PILOT_UAT_SCREENSHOT_DIR ?? "docs/screenshots/purchase-busy-local");
fs.mkdirSync(screenshotDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-proxy-server", "--host-resolver-rules=MAP demo.localhost 127.0.0.1"],
});
const checks = [], fixtureWrites = [], blockedWrites = [];
try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
    await context.addInitScript(() => localStorage.setItem("sf_user", JSON.stringify({ id: 1, username: "admin", name: "Fixture Admin", isAdmin: true })));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const record = (name, ok, evidence = null) => checks.push({ viewport: width, name, status: ok ? "PASS" : "FAIL", evidence });
    let orderState = "draft", receiveAttempts = 0, confirmAttempts = 0, releaseWrite, failDetailOnce = false;
    const order = () => ({ id: 987654, name: "FIXTURE-PO-001", partner_id: [77, "Fixture supplier"], date_order: "2026-10-21 02:00:00", state: orderState, amount_total: 22, amount_untaxed: 20, amount_tax: 2, currency_id: [1, "AUD"], company_id: [1, "Fixture company"], order_line: [1], receipt_status: "pending" });
    await context.route("**/api/**", async (route) => {
      const request = route.request(), pathname = new URL(request.url()).pathname;
      if (request.method() === "POST" && /^\/api\/odoo\/purchase-orders\/987654(?:\/receive)?$/.test(pathname)) {
        fixtureWrites.push({ viewport: width, path: pathname, body: request.postDataJSON() });
        await new Promise((resolve) => { releaseWrite = resolve; });
        if (pathname.endsWith("/receive")) {
          receiveAttempts += 1;
          // A known validation failure is recoverable in the dialog. Unknown
          // 5xx results are covered by productization-local-verify and must
          // stay pending for manual Odoo reconciliation.
          if (receiveAttempts === 1) return route.fulfill({ status: 400, json: { message: "Fixture receipt rejected" } });
          failDetailOnce = width === 1024;
          return route.fulfill({ json: { pickingName: "FIXTURE/IN/001", pickingState: "done" } });
        }
        confirmAttempts += 1;
        if (confirmAttempts === 1) return route.fulfill({ status: 503, json: { message: "Fixture confirmation rejected" } });
        orderState = "purchase";
        return route.fulfill({ json: {} });
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        blockedWrites.push({ method: request.method(), path: pathname });
        return route.fulfill({ status: 405, json: { message: "Fixture blocks unexpected writes" } });
      }
      if (pathname === "/api/odoo/session") return route.fulfill({ json: { user: { id: 1, name: "Fixture" } } });
      if (pathname === "/api/odoo/pos-bootstrap") return route.fulfill({ json: { configs: [] } });
      if (pathname === "/api/odoo/purchase-orders") return route.fulfill({ json: { items: [order()], hasNext: false, limit: 40, offset: 0 } });
      if (pathname === "/api/odoo/purchase-orders/987654" && failDetailOnce) {
        failDetailOnce = false;
        return route.fulfill({ status: 503, json: { message: "Fixture detail refresh unavailable" } });
      }
      if (pathname === "/api/odoo/purchase-orders/987654") return route.fulfill({ json: {
        order: order(), lines: [{ id: 1, product_id: [51, "Fixture wine"], name: "Fixture wine", product_qty: 2, product_uom: [1, "Units"], price_unit: 10, price_subtotal: 20, qty_received: 0 }],
        receipts: [], receiptsAvailable: true, approvalAudits: [], approvalAuditAvailable: true, url: "https://example.invalid/fixture-order",
        receivable: orderState === "purchase" ? { pickingId: 71, pickingName: "FIXTURE/IN/001", moves: [{ id: 81, product_id: [51, "Fixture wine"], product_uom_qty: 2, remaining: 2 }] } : null,
      } });
      return route.fulfill({ json: { code: 0, data: [] } });
    });
    const openDetail = async () => {
      await page.goto(`${base}/purchases/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByRole("button", { name: "FIXTURE-PO-001", exact: true }).filter({ visible: true }).click();
      await page.getByRole("dialog", { name: "FIXTURE-PO-001", exact: true }).waitFor();
      record("purchase uses header AI without a floating modal obstruction", await page.getByRole("button", { name: "Open Orithos AI assistant", exact: true }).count() === 1 && await page.getByRole("button", { name: "Open Orithos AI", exact: true }).count() === 0);
    };
    try {
      await openDetail();
      await page.getByRole("button", { name: "Confirm purchase order", exact: true }).click();
      const confirm = page.getByRole("alertdialog", { name: "Confirm this purchase order?" });
      await confirm.getByRole("button", { name: "Confirm order", exact: true }).click();
      await confirm.getByRole("button", { name: "Confirming…", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      record("Escape cannot dismiss an in-flight purchase confirmation", await confirm.isVisible());
      releaseWrite();
      await page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/odoo/purchase-orders/987654");
      if (await confirm.isVisible()) await confirm.getByRole("alert").waitFor();
      record("confirmation failure remains visible in its dialog", await confirm.getByRole("alert").isVisible().catch(() => false));
      record("confirmation sends one request", confirmAttempts === 1);

      if (!(await confirm.isVisible())) await page.getByRole("button", { name: "Confirm purchase order", exact: true }).click();
      await confirm.getByRole("button", { name: "Confirm order", exact: true }).click();
      await confirm.getByRole("button", { name: "Confirming…", exact: true }).waitFor();
      releaseWrite();
      await confirm.waitFor({ state: "hidden" });
      await page.getByRole("dialog", { name: "FIXTURE-PO-001", exact: true }).waitFor();
      const confirmations = fixtureWrites.filter((write) => write.viewport === width && !write.path.endsWith("/receive"));
      record("confirmation retry preserves reviewed payload", confirmations.length === 2 && JSON.stringify(confirmations[0].body) === JSON.stringify(confirmations[1].body));
      record("successful confirmation refreshes order actions", await page.getByRole("button", { name: "Receive stock", exact: true }).isVisible());

      orderState = "purchase";
      await openDetail();
      await page.getByRole("button", { name: "Receive stock", exact: true }).click();
      const receive = page.getByRole("alertdialog", { name: "Receive stock?", exact: true });
      const quantity = receive.getByRole("spinbutton", { name: "Quantity received for Fixture wine", exact: true });
      await quantity.fill("1");
      await receive.getByRole("button", { name: "Confirm receive", exact: true }).click();
      await receive.getByRole("button", { name: "Receiving…", exact: true }).waitFor();
      record("receipt quantity cannot change while request is pending", await quantity.isDisabled());
      await page.keyboard.press("Escape");
      record("Escape cannot dismiss an in-flight receipt", await receive.isVisible());
      releaseWrite();
      await page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/987654/receive"));
      if (await receive.isVisible()) await receive.getByRole("alert").waitFor();
      record("receipt failure keeps edited quantity and error visible", await receive.isVisible() && await quantity.inputValue() === "1" && await receive.getByRole("alert").isVisible().catch(() => false));
      if (!(await receive.isVisible())) await page.getByRole("button", { name: "Receive stock", exact: true }).click();
      await receive.getByRole("button", { name: "Confirm receive", exact: true }).click();
      await receive.getByRole("button", { name: "Receiving…", exact: true }).waitFor();
      releaseWrite();
      await receive.waitFor({ state: "hidden" });
      if (width === 1024) {
        const detailError = page.getByRole("alertdialog", { name: "Purchase details", exact: true });
        await detailError.waitFor();
        record("receipt success stays visible when detail refresh fails", await detailError.getByRole("status").filter({ hasText: "Received on FIXTURE/IN/001" }).isVisible());
        await detailError.getByRole("button", { name: "Retry details", exact: true }).click();
      }
      const detail = page.getByRole("dialog", { name: "FIXTURE-PO-001", exact: true });
      await detail.waitFor();
      record("receipt success survives detail reload", await detail.getByRole("status").filter({ hasText: "Received on FIXTURE/IN/001 (done)." }).isVisible());
      const receipts = fixtureWrites.filter((write) => write.viewport === width && write.path.endsWith("/receive"));
      record("receipt retry preserves submitted payload", receipts.length === 2 && JSON.stringify(receipts[0].body) === JSON.stringify(receipts[1].body));
      record("no page JS errors or viewport overflow", errors.length === 0 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), errors);
      await detail.getByRole("status").filter({ hasText: "Received on FIXTURE/IN/001" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(screenshotDir, `purchase-receipt-${width}.png`), fullPage: true });
    } catch (error) {
      record("run", false, error instanceof Error ? error.message : "Unexpected failure");
      releaseWrite?.();
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
const failed = checks.filter((check) => check.status === "FAIL").length;
const output = { generatedAt: new Date().toISOString(), sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), sourceWorkingTree: true, nodeVersion: process.version, target: base, scope: "Local browser fixtures for delayed confirmation/receipt, failure recovery and success feedback; all APIs intercepted; no Odoo writes", status: failed === 0 && !blockedWrites.length ? "PASS" : "FAIL", checks, fixtureWrites, blockedWrites };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, failed }));
if (output.status !== "PASS") process.exitCode = 1;
