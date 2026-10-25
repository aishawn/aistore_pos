import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3101";
if (!new URL(base).hostname.endsWith(".localhost")) throw new Error("LOCAL_TENANT_FIXTURE_TARGET_REQUIRED");
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_SUPPLIER_CREATE_LOCAL_2026-10-23_CURRENT.json");
const screenshotDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR ?? "docs/screenshots/2026-10-23-supplier-create-local");
fs.mkdirSync(screenshotDir, { recursive: true });

const fixtureUser = { id: 1, username: "admin", name: "Fixture Admin", isAdmin: true };
const duplicateVat = "11111111111";
const uniqueVat = "22222222222";
const fixtureSupplier = {
  id: 990001,
  name: "Fixture Local Winery",
  phone: "+61 2 5550 0199",
  email: "supplier@example.invalid",
  vat: uniqueVat,
  ref: "LOCAL-UAT",
  supplier_rank: 1,
};
const fastSearchSupplier = { ...fixtureSupplier, id: 990002, name: "Fixture Fast Search Result" };
const slowSearchSupplier = { ...fixtureSupplier, id: 990003, name: "Fixture Stale Search Result" };
const viewports = [320, 390, 768, 1024, 1440].map((width) => ({ width, height: width < 1280 ? 844 : 900 }));
const checks = [];
const fixtureWrites = [];
const blockedWrites = [];
const browser = await chromium.launch({
  headless: true,
  args: ["--no-proxy-server", "--host-resolver-rules=MAP demo.localhost 127.0.0.1"],
});

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name: "orithos_access_token", value: "supplier-create-local-uat", url: base }]);
    await context.addInitScript((user) => {
      localStorage.setItem("sf_token", "supplier-create-local-uat");
      localStorage.setItem("sf_user", JSON.stringify(user));
    }, fixtureUser);

    let created = false;
    let releaseSlowSearch;
    let markSlowSearchStarted;
    const slowSearchStarted = new Promise((resolve) => { markSlowSearchStarted = resolve; });
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      const method = request.method();
      if (pathname === "/api/odoo/session" && method === "GET") {
        return route.fulfill({ json: { user: fixtureUser, autoRecoverConfigured: true } });
      }
      if (pathname === "/api/odoo/pos-bootstrap" && method === "GET") {
        return route.fulfill({ json: { configs: [] } });
      }
      if (pathname === "/api/odoo/records" && method === "POST") {
        const body = request.postDataJSON();
        if (body.type !== "suppliers") return route.fulfill({ status: 400, json: { message: "Unexpected fixture record type" } });
        if (body.query === "slow") {
          markSlowSearchStarted();
          await new Promise((resolve) => { releaseSlowSearch = resolve; });
          return route.fulfill({ json: { items: [slowSearchSupplier], limit: body.limit ?? 40, offset: body.offset ?? 0 } });
        }
        if (body.query === "fast") return route.fulfill({ json: { items: [fastSearchSupplier], limit: body.limit ?? 40, offset: body.offset ?? 0 } });
        if (body.query === "missing") return route.fulfill({ json: { items: [], limit: body.limit ?? 40, offset: body.offset ?? 0 } });
        return route.fulfill({ json: { items: created ? [fixtureSupplier] : [], limit: body.limit ?? 40, offset: body.offset ?? 0 } });
      }
      if (pathname === "/api/odoo/suppliers" && method === "POST") {
        const body = request.postDataJSON();
        fixtureWrites.push({ viewport: viewport.width, vat: body.vat, result: body.vat === duplicateVat ? "duplicate" : "created" });
        if (body.vat === duplicateVat) {
          return route.fulfill({ status: 409, json: { message: "A supplier with this ABN / Tax ID already exists." } });
        }
        created = true;
        return route.fulfill({ status: 201, json: { id: fixtureSupplier.id, name: body.name } });
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        blockedWrites.push({ method, path: pathname, viewport: viewport.width });
        return route.fulfill({ status: 405, json: { message: "Local fixture blocked unexpected writes" } });
      }
      return route.fulfill({ json: { items: [], data: [], configs: [] } });
    });

    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const record = (name, passed, evidence = null) => checks.push({ viewport: viewport.width, name, status: passed ? "PASS" : "FAIL", evidence });
    try {
      const response = await page.goto(`${base}/suppliers/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByRole("heading", { name: "Suppliers", exact: true }).waitFor({ state: "visible" });
      await page.getByRole("heading", { name: "No suppliers yet", exact: true }).waitFor({ state: "visible" });
      const mobile = viewport.width < 1280;
      const table = page.getByRole("table", { name: "Odoo suppliers" });
      record("directory selects mobile cards or desktop table at breakpoint", mobile ? !(await table.isVisible()) : await table.isVisible());
      record("empty state and create action are visible", await page.getByRole("heading", { name: "No suppliers yet" }).isVisible() && await page.getByRole("button", { name: "Add supplier", exact: true }).first().isEnabled());

      const trigger = page.getByRole("main").locator("header").getByRole("button", { name: "Add supplier", exact: true });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "Add supplier to Odoo" });
      await dialog.waitFor({ state: "visible" });
      const initialFocus = await dialog.getByLabel(/Business name/).evaluate((element) => document.activeElement === element);
      const dialogBounds = await dialog.boundingBox();
      const dialogFits = Boolean(dialogBounds && dialogBounds.x >= 0 && dialogBounds.y >= 0 && dialogBounds.x + dialogBounds.width <= viewport.width + 1 && dialogBounds.y + dialogBounds.height <= viewport.height + 1);
      record("dialog receives initial focus and fits viewport", initialFocus && dialogFits, { focused: initialFocus, fits: dialogFits });
      if (viewport.width === 320 || viewport.width === 390 || viewport.width === 1440) {
        await page.screenshot({ path: path.join(screenshotDir, `supplier-create-dialog-${viewport.width}.png`), fullPage: true });
      }
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      record("Escape closes dialog and restores focus to trigger", await trigger.evaluate((element) => document.activeElement === element));

      await trigger.click();
      await dialog.waitFor({ state: "visible" });
      await dialog.getByLabel(/Business name/).fill("Fixture Local Winery");
      await dialog.getByLabel("Phone").fill("+61 2 5550 0199");
      const email = dialog.getByLabel("Email");
      await email.fill("not-an-email");
      await dialog.getByLabel("ABN / Tax ID").fill(duplicateVat);
      await dialog.getByLabel("Internal reference").fill("LOCAL-UAT");
      await dialog.getByRole("button", { name: "Create supplier", exact: true }).click();
      record("malformed email is blocked by browser validation", !(await email.evaluate((element) => element.checkValidity())) && fixtureWrites.filter((write) => write.viewport === viewport.width).length === 0);

      await email.fill("supplier@example.invalid");
      await dialog.getByRole("button", { name: "Create supplier", exact: true }).click();
      await dialog.getByRole("alert").filter({ hasText: "A supplier with this ABN / Tax ID already exists." }).waitFor({ state: "visible" });
      record("duplicate ABN is explained and form values are retained", await dialog.getByLabel(/Business name/).inputValue() === "Fixture Local Winery" && await dialog.getByLabel("ABN / Tax ID").inputValue() === duplicateVat && await dialog.isVisible());

      await dialog.getByLabel("ABN / Tax ID").fill(uniqueVat);
      await dialog.getByRole("button", { name: "Create supplier", exact: true }).click();
      await dialog.waitFor({ state: "detached" });
      if (mobile) await page.locator("article").filter({ hasText: fixtureSupplier.name }).waitFor({ state: "visible" });
      else await page.getByRole("row").filter({ hasText: fixtureSupplier.name }).waitFor({ state: "visible" });
      const writes = fixtureWrites.filter((write) => write.viewport === viewport.width);
      const payloadsCorrect = writes.length === 2 && writes[0].vat === duplicateVat && writes[1].vat === uniqueVat && writes.every((write) => write.result === (write.vat === duplicateVat ? "duplicate" : "created"));
      record("successful creation refreshes supplier directory", payloadsCorrect && created && (mobile ? await page.locator("article").filter({ hasText: fixtureSupplier.name }).isVisible() : await page.getByRole("row").filter({ hasText: fixtureSupplier.name }).isVisible()));
      if (mobile) {
        const card = page.locator("article").filter({ hasText: fixtureSupplier.name });
        record("mobile contact actions are tap targets", await card.locator('a[href^="tel:"]').count() === 1 && await card.locator('a[href^="mailto:"]').count() === 1);
      }
      if (viewport.width === 390 || viewport.width === 1440) {
        await page.screenshot({ path: path.join(screenshotDir, `supplier-created-${viewport.width}.png`), fullPage: true });
      }
      const search = page.getByRole("textbox", { name: "Search suppliers by name, phone, email, ABN or reference" });
      const slowRequest = page.waitForRequest((request) => request.url().includes("/api/odoo/records") && request.method() === "POST" && request.postDataJSON()?.query === "slow");
      const slowResponse = page.waitForResponse((response) => response.url().includes("/api/odoo/records") && response.request().postDataJSON()?.query === "slow");
      await search.fill("slow");
      await slowRequest;
      await slowSearchStarted;
      const fastRequest = page.waitForRequest((request) => request.url().includes("/api/odoo/records") && request.method() === "POST" && request.postDataJSON()?.query === "fast");
      const fastResponse = page.waitForResponse((response) => response.url().includes("/api/odoo/records") && response.request().postDataJSON()?.query === "fast");
      await search.fill("fast");
      await Promise.all([fastRequest, fastResponse]);
      const currentResult = mobile
        ? page.locator("article").filter({ hasText: fastSearchSupplier.name })
        : page.getByRole("row").filter({ hasText: fastSearchSupplier.name });
      await currentResult.waitFor({ state: "visible" });
      record("latest search result renders while an older request is pending", await currentResult.isVisible());
      releaseSlowSearch?.();
      await slowResponse;
      const staleResult = mobile
        ? page.locator("article").filter({ hasText: slowSearchSupplier.name })
        : page.getByRole("row").filter({ hasText: slowSearchSupplier.name });
      await page.waitForFunction((name) => ![...document.querySelectorAll("article tr")].some((item) => item.textContent?.includes(name)), slowSearchSupplier.name);
      record("late stale response cannot replace the latest search", await currentResult.isVisible() && await staleResult.count() === 0);

      const missingResponse = page.waitForResponse((response) => response.url().includes("/api/odoo/records") && response.request().postDataJSON()?.query === "missing");
      await search.fill("missing");
      await missingResponse;
      await page.getByRole("heading", { name: "No suppliers found", exact: true }).waitFor({ state: "visible" });
      record("search empty state offers a clear recovery action", await page.getByRole("button", { name: "Clear search", exact: true }).isVisible());
      const resetResponse = page.waitForResponse((response) => response.url().includes("/api/odoo/records") && response.request().postDataJSON()?.query === "");
      await page.getByRole("button", { name: "Clear search", exact: true }).click();
      await resetResponse;
      const restored = mobile
        ? page.locator("article").filter({ hasText: fixtureSupplier.name })
        : page.getByRole("row").filter({ hasText: fixtureSupplier.name });
      await restored.waitFor({ state: "visible" });
      record("clearing search restores the supplier directory", await restored.isVisible());
      const dimensions = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
      record("directory has no horizontal overflow or page errors", dimensions.document <= dimensions.viewport + 1 && pageErrors.length === 0, { dimensions, pageErrors });
      record("all business APIs stayed inside the local fixture", blockedWrites.filter((write) => write.viewport === viewport.width).length === 0);
      if (response?.status() !== 200) record("page response is HTTP 200", false, response?.status() ?? null);
    } catch (error) {
      record("viewport flow completes", false, error instanceof Error ? error.message : "Unexpected failure");
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const failed = checks.filter((check) => check.status === "FAIL").length;
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  nodeVersion: process.version,
  target: base,
  scope: "Local fixture for supplier directory responsive layout, create dialog, focus, native validation, duplicate ABN recovery and refresh; no Odoo requests",
  status: failed === 0 && blockedWrites.length === 0 ? "PASS" : "FAIL",
  passed: checks.length - failed,
  failed,
  checks,
  fixtureWrites,
  blockedWrites,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: output.passed, failed, fixtureWrites: fixtureWrites.length, blockedWrites: blockedWrites.length }));
if (output.status !== "PASS") process.exitCode = 1;
