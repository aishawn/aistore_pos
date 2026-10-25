import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3101";
const target = new URL(base);
if (!/^(localhost|127\.0\.0\.1|[\w-]+\.localhost)$/.test(target.hostname)) throw new Error("Close-register fixture only accepts localhost.");
const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sourceTreeDirty = Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim());
const screenshotDir = path.resolve(root, "docs/screenshots/2026-10-24-close-register-local");
const outputPath = path.resolve(root, "docs/UAT_CLOSE_REGISTER_LOCAL_2026-10-24.json");
fs.mkdirSync(screenshotDir, { recursive: true });

const user = { id: "fixture-user", username: "close-register-fixture", name: "Close Register Fixture", isAdmin: true, vendorId: 41, outletId: 1 };
const checks = [];
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] });

async function openCloseRegister({ closeMode = "success" } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const writes = [];
  const closeBodies = [];
  let closeCount = 0;
  let closed = false;
  let releaseClose;
  const closeGate = new Promise((resolve) => { releaseClose = resolve; });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await context.addCookies([{ name: "orithos_access_token", value: "close-register-fixture", url: base }]);
  await context.addInitScript((fixtureUser) => {
    localStorage.setItem("sf_token", "close-register-fixture");
    localStorage.setItem("sf_user", JSON.stringify(fixtureUser));
  }, user);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const fulfill = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/auth/me" && method === "GET") return fulfill({ code: 0, data: user });
    if (url.pathname === "/api/odoo/session" && method === "GET") return fulfill({ user: { id: "fixture-odoo-user", name: "Fixture Odoo User" } });
    if (url.pathname === "/api/odoo/pos-bootstrap" && method === "GET") return fulfill({
      activeSessionId: closed ? null : 5,
      configs: [{
        id: 3,
        name: "Fixture Register",
        company: [41, "Fixture Store"],
        timezone: "Australia/Adelaide",
        session: closed ? null : { id: 5, name: "Fixture Session", state: "opened", config_id: [3, "Fixture Register"], user_id: [1, "Fixture User"], start_at: "2026-10-24T09:00:00Z", cashBalanceStart: 100, cashBalanceEnd: 90 },
        paymentMethods: [{ id: 2, name: "Cash", type: "cash", is_cash_count: true }, { id: 3, name: "Card", type: "bank", is_cash_count: false }],
        pricelistIds: [], cashRounding: null, onlyRoundCashMethod: false,
      }],
    });
    if (url.pathname === "/api/odoo/session/close" && method === "POST") {
      writes.push(`${method} ${url.pathname}`);
      closeCount += 1;
      closeBodies.push(request.postDataJSON());
      if (closeMode === "gate") await closeGate;
      if (closeMode === "fail-once" && closeCount === 1) return fulfill({ message: "Fixture close failed" }, 503);
      closed = true;
      return fulfill({ sessionId: 5, sessionName: "Fixture Session", registerName: "Fixture Register", state: "closed", message: "Register close requested in Odoo." });
    }
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      writes.push(`${method} ${url.pathname}`);
      return fulfill({ message: "Unexpected fixture write blocked" }, 405);
    }
    return fulfill({ items: [] });
  });
  await page.goto(`${base}/close`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.getByRole("heading", { name: "Close register" }).waitFor({ state: "visible" });
  await page.getByText("Expected cash", { exact: true }).waitFor({ state: "visible" });
  return { context, page, writes, closeBodies, pageErrors, releaseClose, get closeCount() { return closeCount; } };
}

try {
  const validation = await openCloseRegister();
  const directMode = validation.page.getByRole("button", { name: "Enter total" });
  await directMode.click();
  const cash = validation.page.locator("#counted-cash");
  const review = validation.page.getByRole("button", { name: "Review before closing" });
  assert.equal(await review.isDisabled(), true, "cash-enabled register must require a count");
  await cash.fill("-1");
  assert.equal(await review.isDisabled(), true, "negative cash must be blocked before review");
  await cash.fill("1000001");
  assert.equal(await review.isDisabled(), true, "cash above the accepted range must be blocked before review");
  assert.deepEqual(validation.writes, []);
  checks.push({ id: "required-negative-and-over-limit-count-validation", status: "PASS" });
  await validation.context.close();

  const reconcile = await openCloseRegister({ closeMode: "fail-once" });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await reconcile.page.setViewportSize({ width, height: 900 });
    await reconcile.page.waitForFunction(() => {
      const navigation = document.getElementById("main-navigation");
      return window.innerWidth >= 768 || (navigation?.getAttribute("aria-hidden") === "true" && navigation.getBoundingClientRect().right <= 1);
    });
    const dimensions = await reconcile.page.evaluate(() => {
      const rect = (element) => {
        const bounds = element?.getBoundingClientRect();
        return bounds ? { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom } : null;
      };
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        aiEntry: rect(document.querySelector('[aria-label="Open Orithos AI assistant"]')),
        reviewAction: rect([...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Review before closing"))),
      };
    });
    assert.ok(dimensions.documentWidth <= dimensions.viewportWidth, `horizontal overflow at ${width}px`);
    assert.ok(dimensions.aiEntry && dimensions.aiEntry.top < 50 && dimensions.aiEntry.bottom <= 50, `AI entry must stay in the header at ${width}px`);
    if (dimensions.reviewAction) {
      const overlaps = dimensions.aiEntry.left < dimensions.reviewAction.right && dimensions.aiEntry.right > dimensions.reviewAction.left
        && dimensions.aiEntry.top < dimensions.reviewAction.bottom && dimensions.aiEntry.bottom > dimensions.reviewAction.top;
      assert.equal(overlaps, false, `AI entry overlaps the fixed review action at ${width}px`);
    }
    await reconcile.page.screenshot({ path: path.join(screenshotDir, `close-register-${width}.png`), fullPage: true });
  }
  checks.push({ id: "responsive-counting-screen", status: "PASS", viewports: [320, 390, 768, 1024, 1440] });

  await reconcile.page.getByRole("button", { name: "Increase $50 count" }).click();
  await reconcile.page.getByRole("button", { name: "Increase $20 count" }).click();
  await reconcile.page.getByRole("button", { name: "Increase $20 count" }).click();
  await reconcile.page.getByText("$90.00", { exact: true }).first().waitFor();
  const summary = reconcile.page.getByRole("status", { name: "Cash reconciliation summary" });
  assert.equal(await summary.getByText("$90.00", { exact: true }).count(), 2, "expected and counted cash should both total $90.00");
  await summary.getByText("$0.00", { exact: true }).waitFor();
  await reconcile.page.getByRole("button", { name: "Enter total" }).click();
  assert.equal(await reconcile.page.locator("#counted-cash").inputValue(), "90.00", "switching modes must carry the denomination total");
  await reconcile.page.locator("#counted-cash").fill("88.50");
  await reconcile.page.getByRole("button", { name: "Count by denomination" }).click();
  assert.equal(await reconcile.page.getByRole("spinbutton", { name: "$50 count" }).inputValue(), "1", "switching modes must preserve the note counts");
  assert.equal(await reconcile.page.getByRole("spinbutton", { name: "$20 count" }).inputValue(), "2", "switching modes must preserve the note counts");
  assert.equal(await summary.getByText("$90.00", { exact: true }).count(), 2, "denomination mode should restore its own total");
  await reconcile.page.getByRole("button", { name: "Enter total" }).click();
  assert.equal(await reconcile.page.locator("#counted-cash").inputValue(), "88.50", "switching back must preserve the separately entered total");
  assert.equal(await summary.getByText("$88.50", { exact: true }).count(), 1, "direct mode should restore its own total");
  await reconcile.page.locator("#counted-cash").fill("90.00");
  checks.push({ id: "denomination-math-and-mode-carryover", status: "PASS", denominationCash: 90, directCash: 88.5, difference: 0 });

  const firstReview = reconcile.page.getByRole("button", { name: "Review before closing" });
  await firstReview.click();
  const confirmation = reconcile.page.getByRole("alertdialog", { name: "Close this Odoo session?" });
  await confirmation.waitFor();
  assert.equal(await confirmation.getByText("$90.00", { exact: true }).count(), 2, "review should show expected and counted cash");
  assert.equal(await reconcile.page.getByRole("button", { name: "Confirm close" }).count(), 1);
  await confirmation.getByRole("button", { name: "Keep session open" }).click();
  assert.equal(reconcile.closeCount, 0, "review cancellation must not close the register");

  await reconcile.page.getByRole("button", { name: "Review before closing" }).click();
  await reconcile.page.getByRole("alertdialog", { name: "Close this Odoo session?" }).getByRole("button", { name: "Confirm close" }).click();
  await reconcile.page.locator("div[role='alert']").filter({ hasText: "Fixture close failed" }).waitFor();
  assert.equal(await reconcile.page.locator("#counted-cash").inputValue(), "90.00", "failed close must preserve the counted amount");
  assert.equal(reconcile.closeCount, 1);
  checks.push({ id: "failed-close-preserves-input", status: "PASS", closeRequests: reconcile.closeCount });

  await reconcile.page.getByRole("button", { name: "Retry" }).click();
  await reconcile.page.getByRole("button", { name: "Review before closing" }).waitFor();
  assert.equal(await reconcile.page.locator("#counted-cash").inputValue(), "90.00");
  await reconcile.page.getByRole("button", { name: "Review before closing" }).click();
  await reconcile.page.getByRole("alertdialog", { name: "Close this Odoo session?" }).getByRole("button", { name: "Confirm close" }).click();
  await reconcile.page.getByText("Odoo session state:").waitFor();
  assert.equal(reconcile.closeCount, 2);
  assert.deepEqual(reconcile.closeBodies.map((body) => body.countedCash), [90, 90]);
  assert.equal(await reconcile.page.getByText("This register has no open session.").count(), 1);
  checks.push({ id: "close-retry-and-success-state", status: "PASS", closeRequests: reconcile.closeCount, countedCash: 90 });
  assert.deepEqual(reconcile.pageErrors, []);
  assert.deepEqual(reconcile.writes, ["POST /api/odoo/session/close", "POST /api/odoo/session/close"]);
  await reconcile.context.close();

  const duplicate = await openCloseRegister({ closeMode: "gate" });
  await duplicate.page.getByRole("button", { name: "Enter total" }).click();
  await duplicate.page.locator("#counted-cash").fill("90");
  await duplicate.page.getByRole("button", { name: "Review before closing" }).click();
  const reviewDialog = duplicate.page.getByRole("alertdialog", { name: "Close this Odoo session?" });
  try {
    await reviewDialog.waitFor({ timeout: 5000 });
  } catch {
    throw new Error(`Close review did not open. body=${(await duplicate.page.locator("body").innerText()).slice(-1000)}; errors=${JSON.stringify(duplicate.pageErrors)}`);
  }
  const confirmButton = reviewDialog.locator("button").last();
  const confirmBox = await confirmButton.boundingBox();
  assert.ok(confirmBox);
  const closeRequest = duplicate.page.waitForRequest("**/api/odoo/session/close");
  await confirmButton.click();
  await closeRequest;
  assert.equal(await confirmButton.isDisabled(), true, "confirm must lock while close is in flight");
  await duplicate.page.keyboard.press("Escape");
  await reviewDialog.waitFor({ state: "visible" });
  await duplicate.page.mouse.click(confirmBox.x + confirmBox.width / 2, confirmBox.y + confirmBox.height / 2);
  assert.equal(duplicate.closeCount, 1, "in-flight close must not be submitted twice");
  duplicate.releaseClose();
  await duplicate.page.getByText("Odoo session state:").waitFor();
  assert.deepEqual(duplicate.pageErrors, []);
  checks.push({ id: "in-flight-close-guard-and-escape-lock", status: "PASS", closeRequests: duplicate.closeCount });
  assert.deepEqual(duplicate.writes, ["POST /api/odoo/session/close"]);
  await duplicate.context.close();

  const report = { generatedAt: new Date().toISOString(), status: "PASS", source: "local Playwright fixture; all API calls intercepted", nodeVersion: process.version, sourceHead, sourceTreeDirty, target: `${target.origin}/close`, checks, screenshots: path.relative(root, screenshotDir).replaceAll("\\", "/"), realOdooWrites: 0 };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const report = { generatedAt: new Date().toISOString(), status: "FAIL", source: "local Playwright fixture; APIs intercepted when page load succeeds", nodeVersion: process.version, sourceHead, sourceTreeDirty, target: `${target.origin}/close`, checks, error: error instanceof Error ? error.message : String(error) };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
