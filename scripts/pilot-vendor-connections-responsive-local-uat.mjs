import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_VENDOR_CONNECTIONS_RESPONSIVE_LOCAL_2026-10-20.json");
const screenshotDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR ?? "docs/screenshots/2026-10-21-vendor-connections-responsive");
fs.mkdirSync(screenshotDir, { recursive: true });
const fixtureUser = { id: 1, name: "Admin", username: "admin", isAdmin: true, outletId: 1, vendorId: 1, pendingPasswordReset: false };
const vendor = { id: "vendor-1", name: "Demo EDI Vendor", senderCode: "SENDER-01", customerId: "CUSTOMER-01" };
const viewports = [320, 390, 768, 1024, 1440].map((width) => ({ width, height: width < 1280 ? 844 : 900 }));
const checks = [];
const blockedWrites = [];
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name: "orithos_access_token", value: "vendor-layout-uat", url: base }]);
    await context.addInitScript((user) => {
      localStorage.setItem("sf_token", "vendor-layout-uat");
      localStorage.setItem("sf_user", JSON.stringify(user));
    }, fixtureUser);
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() !== "GET") {
        blockedWrites.push(`${request.method()} ${url.pathname}`);
        return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "Fixture blocked writes", data: null }) });
      }
      if (url.pathname === "/api/auth/me") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "ok", data: fixtureUser }) });
      if (url.pathname === "/api/vendor-connections") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "ok", data: [vendor] }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "ok", data: [] }) });
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const response = await page.goto(`${base}/utilities/vendor-connections`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const heading = page.getByRole("heading", { name: "Vendor Connections", exact: true });
    await heading.waitFor({ state: "visible", timeout: 20000 });
    const mobileList = page.getByRole("list", { name: "Vendor connections list" });
    const mobileVendor = mobileList.getByText(vendor.name, { exact: true });
    const desktopRow = page.getByRole("row", { name: new RegExp(vendor.name) });
    const mobile = viewport.width < 1280;
    if (mobile) {
      await mobileList.waitFor({ state: "visible", timeout: 20000 });
      await mobileVendor.waitFor({ state: "visible", timeout: 20000 });
    } else await desktopRow.waitFor({ state: "visible", timeout: 20000 });
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    const mobileFields = mobile ? await Promise.all([
      mobileList.getByText("Sender code", { exact: true }).isVisible(),
      mobileList.getByText(vendor.senderCode, { exact: true }).isVisible(),
      mobileList.getByText("Customer ID", { exact: true }).isVisible(),
      mobileList.getByText(vendor.customerId, { exact: true }).isVisible(),
    ]) : null;
    const screenshot = path.join(screenshotDir, `vendor-connections-${viewport.width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    checks.push({
      viewport: viewport.width,
      httpStatus: response?.status() ?? 0,
      headingVisible: await heading.isVisible(),
      vendorVisible: mobile ? await mobileVendor.isVisible() : await desktopRow.isVisible(),
      mobileListVisible: mobile ? await page.getByRole("list", { name: "Vendor connections list" }).isVisible() : null,
      mobileActionsVisible: mobile ? await page.getByRole("button", { name: "Edit" }).isVisible() && await page.getByRole("button", { name: "Delete" }).isVisible() : null,
      mobileFieldsVisible: mobile ? mobileFields.every(Boolean) : null,
      desktopTableVisible: !mobile ? await page.getByRole("table").isVisible().catch(() => false) : null,
      pageNoOverflow: dimensions.width <= dimensions.viewport + 1,
      screenshot: path.relative(root, screenshot).replaceAll(path.sep, "/"),
      pageErrors,
    });
    await page.close();
    await context.close();
  }
} finally {
  await browser.close();
}

const failures = checks.filter((check) => check.httpStatus !== 200 || !check.headingVisible || !check.vendorVisible || check.mobileListVisible === false || check.mobileActionsVisible === false || check.mobileFieldsVisible === false || check.desktopTableVisible === false || !check.pageNoOverflow || check.pageErrors.length > 0);
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  environment: "local-dev-fixtures",
  target: base,
  scope: "Vendor Connections responsive cards/tables, sender/customer identifiers, edit/delete controls at 320/390/768/1024/1440; API requests intercepted; no business writes",
  status: failures.length === 0 && blockedWrites.length === 0 ? "PASS" : "FAIL",
  passed: checks.length - failures.length,
  failed: failures.length,
  checks,
  blockedWrites,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: output.passed, failed: output.failed, blockedWrites: blockedWrites.length }));
if (failures.length || blockedWrites.length) process.exitCode = 1;
