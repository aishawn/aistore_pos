import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3100";
if (!new URL(base).hostname.endsWith(".localhost") && !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) {
  throw new Error("This fixture UAT is local-only.");
}
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_CUSTOMER_DIRECTORY_LOCAL_CURRENT.json");
const screenshotDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR ?? "docs/screenshots/2026-10-23-customer-directory-local");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(screenshotDir, { recursive: true });

const fixtureUser = { id: 1, username: "fixture-admin", name: "Fixture Admin", isAdmin: true, vendorId: 41, outletId: 1 };
const odooUser = { id: "fixture-odoo", username: "fixture", name: "Fixture Staff", isAdmin: false, allowedCompanyIds: [41] };
const checks = [];
const simulatedWrites = [];
const widths = [390, 768, 1024, 1440];
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server", "--host-resolver-rules=MAP demo.localhost 127.0.0.1"] });

function record(width, name, status, details) {
  checks.push({ width, name, status, ...(details ? { details } : {}) });
}

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addCookies([{ name: "orithos_access_token", value: "customer-directory-fixture", url: base }]);
    await context.addInitScript((user) => {
      localStorage.setItem("sf_token", "customer-directory-fixture");
      localStorage.setItem("sf_user", JSON.stringify(user));
    }, fixtureUser);

    let groups = [];
    let createAttempts = 0;
    const createdCustomers = [];
    const createPayloads = [];
    let releaseDelayedSearch;
    let delayedSearchStartedResolve;
    const delayedSearchStarted = new Promise((resolve) => { delayedSearchStartedResolve = resolve; });
    const delayedSearchGate = new Promise((resolve) => { releaseDelayedSearch = resolve; });
    const pageErrors = [];
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const fulfill = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

      if (url.pathname === "/api/auth/me" && method === "GET") return fulfill({ code: 0, data: fixtureUser });
      if (url.pathname === "/api/odoo/session" && method === "GET") return fulfill({ user: odooUser, autoRecoverConfigured: false });
      if (url.pathname === "/api/odoo/pos-bootstrap" && method === "GET") return fulfill({ configs: [{ id: 2, name: "Fixture Register", company: [41, "Fixture Store"], timezone: "Australia/Adelaide", session: null, paymentMethods: [] }], activeSessionId: null });
      if (url.pathname === "/api/odoo/pricelists" && method === "GET") {
        return fulfill({ items: [{ id: 3, name: "Fixture Retail", currency: "AUD", currencyId: 1, company: "Fixture Store", companyId: 41, active: true }], hasNext: false });
      }
      if (url.pathname === "/api/odoo/customer-groups" && method === "GET") return fulfill({ items: groups, hasNext: false });
      if (url.pathname === "/api/odoo/records" && method === "POST") {
        const body = request.postDataJSON() ?? {};
        assert.equal(body.type, "customers");
        const query = String(body.query ?? "").toLowerCase();
        if (query === "delayed-no-match") {
          delayedSearchStartedResolve();
          await delayedSearchGate;
        }
        const items = [
          { id: 501, name: "Fixture Retailer", phone: "0412000000", email: "retailer@example.test", ref: "FIX-501", property_product_pricelist: [3, "Fixture Retail"], category_id: [9], credit: 12.5, total_invoiced: 100, company_type: "company", street: "1 Test St", city: "Adelaide", vat: "TEST-ABN" },
          ...createdCustomers,
        ].filter((item) => !query || `${item.name} ${item.email} ${item.ref}`.toLowerCase().includes(query));
        return fulfill({ items, limit: body.limit ?? 41, offset: body.offset ?? 0, hasNext: false });
      }
      if (url.pathname === "/api/odoo/customers" && method === "POST") {
        const payload = request.postDataJSON() ?? {};
        createPayloads.push(payload);
        simulatedWrites.push(`${method} ${url.pathname}`);
        createAttempts += 1;
        if (createAttempts === 1) return fulfill({ message: "Fixture temporary failure" }, 503);
        createdCustomers.push({ id: 900, ...payload, property_product_pricelist: [3, "Fixture Retail"], category_id: [9], credit: 0, total_invoiced: 0 });
        return fulfill({ id: 900, name: payload.name }, 201);
      }
      if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
        simulatedWrites.push(`${method} ${url.pathname}`);
        return fulfill({ message: "Fixture blocked unexpected write" }, 405);
      }
      return fulfill({ code: 0, data: {} });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${base}/customers/odoo`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByRole("heading", { name: "Customers", exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector("main")?.textContent?.includes("Fixture Retailer"));
    record(width, "customer directory loads Odoo fixture records", "PASS");

    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    assert.equal(noOverflow, true, `horizontal overflow at ${width}px`);
    record(width, "responsive layout has no horizontal overflow", "PASS");

    if (width < 1280) {
      const listBox = await page.locator("main > section[aria-busy='false']").boundingBox();
      assert.ok(listBox && listBox.height < 380, `customer list should fit its single result at ${width}px`);
      record(width, "short customer result sets keep pagination close to the records", "PASS", { listHeight: listBox.height });
    }

    assert.equal(await page.locator("header").getByRole("button", { name: "Open Orithos AI assistant" }).count(), 1);
    assert.equal(await page.locator('[aria-label="Open Orithos AI assistant"]').count(), 1);

    await page.screenshot({ path: path.join(screenshotDir, `customers-${width}.png`), fullPage: true });
    if (width === 390) {
      const search = page.getByRole("textbox", { name: "Search customers by name, phone, email or customer code", exact: true });
      await search.fill("delayed-no-match");
      assert.equal(await search.getAttribute("aria-busy"), "true");
      assert.equal(await page.getByRole("button", { name: "Edit", exact: true }).last().isDisabled(), true);
      record(width, "search immediately locks stale customer edits", "PASS");
      await Promise.race([
        delayedSearchStarted,
        page.waitForTimeout(5_000).then(() => { throw new Error("DELAYED_SEARCH_DID_NOT_START"); }),
      ]);
      assert.equal(await page.getByRole("button", { name: "Edit", exact: true }).last().isDisabled(), true);
      releaseDelayedSearch();
      await page.getByText("No customers match this search", { exact: true }).last().waitFor();
      record(width, "current delayed search replaces stale customer rows", "PASS");
      await search.fill("");
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Edit" && !button.disabled && button.getClientRects().length > 0));
      record(width, "fresh customer rows re-enable edit controls", "PASS");
    }
    await page.getByRole("button", { name: "New customer" }).click();
    await page.getByRole("dialog").waitFor();
    await page.getByText("No Odoo customer groups are configured. A store admin can add groups under Customer Groups.", { exact: true }).waitFor();
    assert.equal(await page.getByText("Create them under Customer Groups.", { exact: true }).count(), 0);
    record(width, "empty group state gives accurate Odoo setup guidance", "PASS");

    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    groups = [{ id: 9, name: "Wholesale", color: 0, parentId: null, parentName: null, customerCount: 1 }];
    await page.getByRole("button", { name: "New customer" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Wholesale", exact: true }).waitFor();
    await dialog.getByLabel("Customer name").fill("Fixture New Account");
    await dialog.getByLabel("Phone").fill("0412000001");
    await dialog.getByLabel("Email").fill("new@example.test");
    await dialog.getByLabel("Type").selectOption("company");
    await dialog.getByLabel("Price list").selectOption("3");
    await dialog.getByRole("button", { name: "Wholesale", exact: true }).click();
    await dialog.getByRole("button", { name: "Create customer" }).click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(await dialog.getByLabel("Customer name").inputValue(), "Fixture New Account");
    assert.equal(await dialog.isVisible(), true);
    record(width, "create failure preserves form values for retry", "PASS");

    await dialog.getByRole("button", { name: "Create customer" }).click();
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.querySelector("main")?.textContent?.includes("Fixture New Account"));
    assert.equal(createPayloads.length, 2);
    assert.equal(createPayloads[1].property_product_pricelist, 3);
    assert.deepEqual(createPayloads[1].category_id, [9]);
    assert.equal(createPayloads[1].company_type, "company");
    record(width, "create retry sends selected price list and group", "PASS");
    assert.deepEqual(pageErrors, []);
    await context.close();
  }
} finally {
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceWorkingTreeDirty: execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim().length > 0,
  target: base,
  environment: `local Next.js dev server; Node ${process.version}; browser API fixtures`,
  scope: "Odoo customer directory search/create form and responsive UI; all API requests intercepted",
  status: checks.some((check) => check.status === "FAIL") ? "FAIL" : "PASS",
  passed: checks.filter((check) => check.status === "PASS").length,
  failed: checks.filter((check) => check.status === "FAIL").length,
  simulatedWriteRequests: simulatedWrites.length,
  productionBusinessWrites: 0,
  simulatedWrites,
  checks,
  screenshots: widths.map((width) => path.relative(root, path.join(screenshotDir, `customers-${width}.png`)).replaceAll("\\", "/")),
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: output.passed, failed: output.failed, productionBusinessWrites: output.productionBusinessWrites, simulatedWriteRequests: output.simulatedWriteRequests }));
if (output.failed) process.exitCode = 1;
