import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3101";
const targetUrl = new URL(base);
if (!/^(localhost|127\.0\.0\.1|[\w-]+\.localhost)$/.test(targetUrl.hostname)) {
  throw new Error("The POS checkout fixture only accepts a localhost target.");
}

const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sourceTreeDirty = Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim());
const screenshotDir = path.resolve(root, "docs/screenshots/2026-10-24-pos-checkout-local");
const outputPath = path.resolve(root, "docs/UAT_POS_CHECKOUT_LOCAL_2026-10-24.json");
fs.mkdirSync(screenshotDir, { recursive: true });

const user = { id: "fixture-user", username: "pos-checkout-fixture", name: "POS Checkout Fixture", isAdmin: true, vendorId: 41, outletId: 1 };
const checks = [];
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] });

function product() {
  return { id: 11, name: "Fixture Product", display_name: "Fixture Product", barcode: false, default_code: "FX-11", list_price: 12.5, taxes_id: [1], price_included: 12.5, price_tax: 1.14, qty_available: 8, free_qty: 8, uom_id: [1, "Units"], pos_categ_ids: [1], available_in_pos: true };
}

async function newRegister({ method = "cash", checkoutMode = "success" } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const writes = [];
  const checkoutBodies = [];
  let checkoutCount = 0;
  let statusCount = 0;
  let releaseCheckout;
  const checkoutGate = new Promise((resolve) => { releaseCheckout = resolve; });
  await context.addCookies([{ name: "orithos_access_token", value: "pos-checkout-fixture", url: base }]);
  await context.addInitScript((fixtureUser) => {
    localStorage.setItem("sf_token", "pos-checkout-fixture");
    localStorage.setItem("sf_user", JSON.stringify(fixtureUser));
  }, user);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const methodName = request.method();
    const fulfill = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (url.pathname === "/api/auth/me" && methodName === "GET") return fulfill({ code: 0, data: user });
    if (url.pathname === "/api/odoo/session" && methodName === "GET") return fulfill({ user: { id: "fixture-odoo-user", name: "Fixture Odoo User" }, autoRecoverConfigured: false });
    if (url.pathname === "/api/odoo/pos-bootstrap" && methodName === "GET") {
      const paymentMethods = method === "both"
        ? [{ id: 2, name: "Cash", type: "cash", is_cash_count: true }, { id: 3, name: "Card", type: "bank", is_cash_count: false }]
        : [{ id: method === "card" ? 3 : 2, name: method === "card" ? "Card" : "Cash", type: method === "card" ? "bank" : "cash", is_cash_count: method !== "card" }];
      return fulfill({ activeSessionId: 5, configs: [{ id: 3, name: "Fixture Register", company: [41, "Fixture Store"], timezone: "Australia/Adelaide", session: { id: 5, name: "Fixture Session", state: "opened", config_id: [3, "Fixture Register"], user_id: [1, "Fixture User"], start_at: "2026-10-24T09:00:00Z", cashBalanceStart: 100, cashBalanceEnd: null }, paymentMethods, pricelistIds: [], cashRounding: null, onlyRoundCashMethod: false }] });
    }
    if (url.pathname === "/api/odoo/records" && methodName === "POST") {
      const body = request.postDataJSON();
      if (body.type === "products") return fulfill({ items: [product()], limit: body.limit ?? 50, offset: 0, hasNext: false });
      if (body.type === "posCategories") return fulfill({ items: [{ id: 1, name: "Fixture Category", parent_id: false }], limit: body.limit ?? 100, offset: 0, hasNext: false });
      return fulfill({ items: [], limit: body.limit ?? 50, offset: body.offset ?? 0, hasNext: false });
    }
    if (url.pathname === "/api/odoo/checkout/quote" && methodName === "POST") {
      const body = request.postDataJSON();
      return fulfill({ subtotal: 11.36, tax: 1.14, total: 12.5, unroundedTotal: 12.5, lines: body.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, uomFactor: line.uomFactor ?? 1, subtotal: 11.36, tax: 1.14, total: 12.5 })) });
    }
    if (url.pathname === "/api/odoo/checkout" && methodName === "POST") {
      writes.push(`${methodName} ${url.pathname}`);
      checkoutCount += 1;
      checkoutBodies.push(request.postDataJSON());
      if (checkoutMode === "gate") await checkoutGate;
      if (checkoutMode === "unknown") return fulfill({ message: "fixture timeout" }, 503);
      return fulfill({ saleId: 501, receipt: "POS/2026/00501", total: 12.5, gst: 1.14, subtotal: 11.36, tendered: checkoutBodies.at(-1)?.tendered ?? 12.5, change: Math.max(0, (checkoutBodies.at(-1)?.tendered ?? 12.5) - 12.5), lines: [{ name: "Fixture Product", quantity: 1, subtotal: 11.36, total: 12.5 }], date: "2026-10-24T09:30:00Z", session: "Fixture Session" });
    }
    if (url.pathname === "/api/odoo/checkout/status" && methodName === "GET") {
      statusCount += 1;
      return checkoutMode === "unknown" && statusCount === 1
        ? fulfill({ resultState: "pending" })
        : fulfill({ resultState: "confirmed", result: { saleId: 501, receipt: "POS/2026/00501", total: 12.5, gst: 1.14, subtotal: 11.36, tendered: 15, change: 2.5, lines: [{ name: "Fixture Product", quantity: 1, subtotal: 11.36, total: 12.5 }], date: "2026-10-24T09:30:00Z", session: "Fixture Session" } });
    }
    if (methodName !== "GET" && methodName !== "HEAD" && methodName !== "OPTIONS") {
      writes.push(`${methodName} ${url.pathname}`);
      return fulfill({ message: "Fixture blocked unexpected write" }, 405);
    }
    return fulfill({ items: [] });
  });
  await page.goto(`${base}/register/odoo`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.getByRole("combobox", { name: "Search products by name, barcode or code" }).waitFor({ state: "visible" });
  await page.getByRole("option", { name: /Fixture Product/ }).waitFor({ state: "visible" });
  return { context, page, writes, checkoutBodies, releaseCheckout, get checkoutCount() { return checkoutCount; }, get statusCount() { return statusCount; }, pageErrors };
}

try {
  const empty = await newRegister();
  const finalise = empty.page.getByRole("button", { name: "Finalise" });
  assert.equal(await finalise.isDisabled(), true, "empty cart must not be finalisable");
  checks.push({ id: "empty-cart-disabled", status: "PASS" });
  await empty.context.close();

  const cash = await newRegister();
  await cash.page.getByRole("option", { name: /Fixture Product/ }).click();
  await cash.page.getByText("Due $12.50").waitFor();
  await cash.page.locator("#cash-tendered").fill("10.00");
  assert.equal(await cash.page.getByRole("button", { name: "Finalise" }).isDisabled(), true, "cash shortfall must block checkout");
  checks.push({ id: "cash-shortfall-blocked", status: "PASS" });
  await cash.page.locator("#cash-tendered").fill("15.00");
  await cash.page.getByText("Change $2.50").waitFor();
  assert.equal(await cash.page.getByRole("button", { name: "Finalise" }).isDisabled(), false);
  await cash.page.getByRole("button", { name: "Finalise" }).click();
  await cash.page.getByRole("dialog", { name: /Sale complete/ }).waitFor();
  assert.equal(cash.checkoutCount, 1);
  assert.equal(cash.checkoutBodies[0].tendered, 15);
  assert.equal(await cash.page.getByText("POS/2026/00501").count(), 1);
  assert.equal(cash.writes.filter((write) => write.includes("/checkout")).length, 1);
  checks.push({ id: "cash-change-checkout-and-receipt", status: "PASS", checkoutRequests: cash.checkoutCount });
  await cash.context.close();

  const card = await newRegister({ method: "card" });
  await card.page.getByRole("option", { name: /Fixture Product/ }).click();
  await card.page.waitForFunction(() => { const checkbox = document.querySelector('input[type="checkbox"]'); return checkbox instanceof HTMLInputElement && !checkbox.disabled; });
  assert.equal(await card.page.getByRole("button", { name: "Finalise" }).isDisabled(), true, "external payment must require confirmation");
  await card.page.getByRole("checkbox", { name: /Payment approved on the external terminal/ }).check();
  assert.equal(await card.page.getByRole("button", { name: "Finalise" }).isDisabled(), false);
  await card.page.getByRole("button", { name: "Finalise" }).click();
  await card.page.getByRole("dialog", { name: /Sale complete/ }).waitFor();
  assert.equal(card.checkoutBodies[0].externalPaymentConfirmed, true);
  checks.push({ id: "external-payment-confirmation", status: "PASS" });
  await card.context.close();

  const unknown = await newRegister({ checkoutMode: "unknown" });
  await unknown.page.getByRole("option", { name: /Fixture Product/ }).click();
  await unknown.page.getByText("Due $12.50").waitFor();
  await unknown.page.getByRole("button", { name: "Finalise" }).click();
  await unknown.page.getByRole("heading", { name: "Payment result pending confirmation" }).waitFor();
  assert.equal(unknown.checkoutCount, 1);
  assert.match(await unknown.page.locator("main [role='alert']").innerText(), /Do not take payment again/);
  const pendingReference = await unknown.page.locator("main p").filter({ hasText: "Order reference:" }).innerText();
  await unknown.page.reload({ waitUntil: "domcontentloaded" });
  await unknown.page.getByRole("heading", { name: "Payment result pending confirmation" }).waitFor();
  assert.equal(await unknown.page.locator("main p").filter({ hasText: "Order reference:" }).innerText(), pendingReference, "refresh must restore the same pending order identity");
  assert.match(await unknown.page.locator("main [role='alert']").innerText(), /Do not take payment again/);
  checks.push({ id: "unknown-order-restored-after-refresh", status: "PASS" });
  await unknown.page.getByRole("button", { name: "Check saved order" }).click();
  await unknown.page.getByRole("dialog", { name: /Sale complete/ }).waitFor();
  assert.equal(unknown.checkoutCount, 1, "recovery must query status without resubmitting payment");
  assert.equal(unknown.statusCount, 2);
  checks.push({ id: "unknown-result-recovery-without-replay", status: "PASS", checkoutRequests: unknown.checkoutCount, recoveryQueries: unknown.statusCount });
  await unknown.context.close();

  const duplicate = await newRegister({ checkoutMode: "gate" });
  await duplicate.page.getByRole("option", { name: /Fixture Product/ }).click();
  await duplicate.page.getByText("Due $12.50").waitFor();
  const submit = duplicate.page.getByRole("button", { name: "Finalise" });
  const submitBox = await submit.boundingBox();
  assert.ok(submitBox, "finalise button should have a stable position before submission");
  const checkoutRequest = duplicate.page.waitForRequest("**/api/odoo/checkout");
  await submit.click();
  await checkoutRequest;
  await duplicate.page.mouse.click(submitBox.x + submitBox.width / 2, submitBox.y + submitBox.height / 2);
  assert.equal(duplicate.checkoutCount, 1, "the in-flight submit lock must reject the second click");
  duplicate.releaseCheckout();
  try {
    await duplicate.page.getByRole("dialog", { name: /Sale complete/ }).waitFor({ timeout: 15000 });
  } catch {
    throw new Error(`Delayed checkout did not show receipt. submits=${duplicate.checkoutCount}; errors=${JSON.stringify(duplicate.pageErrors)}; body=${(await duplicate.page.locator("body").innerText()).slice(-1200)}`);
  }
  assert.equal(duplicate.checkoutCount, 1, "rapid duplicate clicks must submit once");
  checks.push({ id: "duplicate-submit-guard", status: "PASS", checkoutRequests: duplicate.checkoutCount });

  const viewportResults = [];
  for (const width of [320, 390, 768, 1024, 1440]) {
    await duplicate.page.setViewportSize({ width, height: 900 });
    await duplicate.page.waitForTimeout(60);
    const dimensions = await duplicate.page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth, dialog: (() => { const r = document.querySelector('[role="dialog"]')?.getBoundingClientRect(); return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null; })() }));
    assert.ok(dimensions.documentWidth <= dimensions.viewportWidth, `horizontal overflow at ${width}px`);
    assert.ok(dimensions.dialog && dimensions.dialog.left >= 0 && dimensions.dialog.right <= dimensions.viewportWidth, `receipt overlaps viewport edge at ${width}px`);
    viewportResults.push({ width, ...dimensions });
    await duplicate.page.screenshot({ path: path.join(screenshotDir, `receipt-${width}.png`), fullPage: true });
  }
  checks.push({ id: "receipt-responsive", status: "PASS", viewports: viewportResults });
  assert.deepEqual(duplicate.pageErrors, []);
  assert.deepEqual(duplicate.writes, ["POST /api/odoo/checkout"], "fixture must be the only intercepted business write");
  checks.push({ id: "browser-errors-and-write-isolation", status: "PASS", pageErrors: duplicate.pageErrors, interceptedFixtureWrites: duplicate.writes });
  assert.deepEqual(checks.filter((check) => check.status === "FAIL"), []);

  const report = { generatedAt: new Date().toISOString(), status: "PASS", source: "local Playwright fixture; all API calls intercepted", nodeVersion: process.version, sourceHead, sourceTreeDirty, target: `${targetUrl.origin}/register/odoo`, checks, screenshots: path.relative(root, screenshotDir).replaceAll("\\", "/") };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const report = { generatedAt: new Date().toISOString(), status: "FAIL", source: "local Playwright fixture; APIs intercepted when page load succeeds", nodeVersion: process.version, sourceHead, sourceTreeDirty, target: `${targetUrl.origin}/register/odoo`, checks, error: error instanceof Error ? error.message : String(error) };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
