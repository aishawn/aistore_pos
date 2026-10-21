/** Verify that Odoo gateway errors expose a request ID in user-facing pages. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035").replace(/\/+$/, "");
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_ODOO_ERROR_CORRELATION_LOCAL_2026-10-24_UI.json");
const screenshotDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR ?? "docs/screenshots/2026-10-24-odoo-error-correlation");
const requestId = "33333333-3333-4333-8333-333333333333";
const fixtureUser = { id: 1, name: "Admin", username: "admin", isAdmin: true, outletId: 1, vendorId: 1, pendingPasswordReset: false };
const checks = [];
const blockedWrites = [];
const record = (name, passed, evidence) => checks.push({ name, status: passed ? "PASS" : "FAIL", evidence });

const browser = await chromium.launch({ headless: true });
fs.mkdirSync(screenshotDir, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
  await context.addInitScript((user) => localStorage.setItem("sf_user", JSON.stringify(user)), fixtureUser);
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      blockedWrites.push(`${request.method()} ${url.pathname}`);
      return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ message: "fixture blocked write" }) });
    }
    if (url.pathname === "/api/auth/me") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: fixtureUser }) });
    }
    if (url.pathname === "/api/odoo/session") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: fixtureUser, autoRecoverConfigured: true }) });
    }
    if (url.pathname === "/api/odoo/price-suggestions" || url.pathname === "/api/odoo/reporting-dashboard") {
      return route.fulfill({
        status: 502,
        headers: { "Content-Type": "application/json", "X-Correlation-ID": requestId },
        body: JSON.stringify({ message: "Odoo is temporarily unavailable. Try again shortly." }),
      });
    }
    return route.continue();
  });

  for (const item of [
    { path: "/stock/price-suggestions", heading: "Price suggestions" },
    { path: "/reports/dashboard", heading: "Odoo reporting" },
  ]) {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}${item.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: item.heading, exact: true }).waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const visible = bodyText.includes(requestId);
    record(`${item.heading} shows gateway request ID`, visible, `${item.path} · ${requestId}${visible ? "" : ` · body=${bodyText.slice(0, 240)}`}`);
    record(`${item.heading} has no page error`, errors.length === 0, errors.join(" | "));
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    record(`${item.heading} has no horizontal overflow`, dimensions.content <= dimensions.viewport, `${dimensions.content}/${dimensions.viewport}px`);
    await page.screenshot({ path: path.join(screenshotDir, `${item.path.split("/").at(-1)}-390.png`), fullPage: true });
    await page.close();
  }
  record("fixture blocked business writes", blockedWrites.length === 0, blockedWrites.join(", "));
} finally {
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  target: base,
  scope: "local intercepted UI error-state verification",
  requestId,
  checks,
  blockedWrites,
  status: checks.every((check) => check.status === "PASS") && blockedWrites.length === 0 ? "PASS" : "FAIL",
  limitation: "The fixture proves UI rendering and correlation propagation only; it does not prove the Odoo upstream is healthy.",
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, blockedWrites: blockedWrites.length }));
if (output.status !== "PASS") process.exitCode = 1;
