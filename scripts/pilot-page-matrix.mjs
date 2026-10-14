import fs from "fs";
import path from "path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const base = "https://app.orithos.com.au";
const password = env.INITIAL_ADMIN_PASSWORD;
if (!password) {
  console.error("MISSING_ADMIN_PASSWORD");
  process.exit(1);
}

const pages = [
  { path: "/overview", expect: [/Good (morning|afternoon|evening)/, /Sales trend|Current sale/] },
  { path: "/", expect: [/orithos_store1\/00004/, /12 avail/, /Finalise/] },
  { path: "/history/odoo", expect: [/Sales History/, /260-1-00000/] },
  { path: "/close", expect: [/orithos_store1\/00004/, /Close register/] },
  { path: "/products/odoo", expect: [/DEMO-SB-2024|Sauvignon Blanc/, /DEMO-SHIRAZ21|Barossa Shiraz/, /\b12\s*Units\b/i] },
  { path: "/customers/odoo", expect: [/Customers|No customers|Walk-in|empty|0/i] },
  { path: "/customers/balances", expect: [/Balances/i, /View customer balances, statements and payments/i, /Search for Customers/i] },
  { path: "/suppliers/odoo", expect: [/Suppliers|No suppliers|empty|0/i] },
  { path: "/purchases/odoo", expect: [/Purchases|No purchase|empty|RFQ|0/i] },
  { path: "/stock/replenishment", expect: [/Replenishment|suggest|0|no completed sales/i] },
  { path: "/reports/dashboard", expect: [/Reporting|Sales|transaction|\$/i] },
  { path: "/settings/integrations", expect: [/Integrations|Odoo|Connected|auto-reconnect|auto recover/i] },
  { path: "/settings/payment", expect: [/Payment|Card|Cash/i] },
  { path: "/settings/tax", expect: [/Tax|GST|WET/i] },
  { path: "/settings/registers-outlets", expect: [/Register|orithos_store1|Outlet|Company/i] },
  { path: "/settings/receipts", expect: [/not connected yet|Receipt settings are not connected|Receipt delivery is not connected/i] },
  { path: "/settings/hardware", expect: [/No hardware connection has been verified|Hardware setup is local to this terminal/i] },
  { path: "/settings/customerdisplay", expect: [/Customer display is not available in this pilot/i, /Check peripheral status/i] },
  { path: "/settings/loyalty", expect: [/Loyalty Settings/i, /These loyalty rules are not connected to this screen/i, /Sample value/i] },
  { path: "/settings/barcodes", expect: [/Barcode label printing is not connected/i, /Choose products/i, /Unavailable/i] },
  { path: "/utilities/barcodes", expect: [/Barcode label printing is not connected/i, /Choose a label/i, /No label document is generated/i] },
  { path: "/settings/surcharging", expect: [/Surcharge settings are not connected here/i, /Sample value/i, /do not change checkout totals/i] },
  { path: "/settings/statements", expect: [/Statement previews are available/i, /Customer Balances/i, /Automatic statement settings/i] },
  { path: "/settings/company/general", expect: [/not connected to Odoo/i] },
  { path: "/settings/users", expect: [/Invite staff|Store users|admin/i] },
  { path: "/settings/roles", expect: [/Roles|New role|Permissions/i] },
  { path: "/settings/account", expect: [/Account|Password|Profile|Security/i] },
  { path: "/settings/keys", expect: [/not part of the Odoo pilot/i] },
  { path: "/sommelier", expect: [/Wine|Sommelier|AI|assistant|disabled|not enabled|coming/i] },
  { path: "/sommelier/find", expect: [/Find|Wine|taste|AI|disabled|not enabled/i] },
  { path: "/sommelier/identify", expect: [/Identify|label|AI|disabled|not enabled|upload/i] },
  { path: "/invoices/scan", expect: [/Invoice|scan|AI|OCR|disabled|not enabled|supplier/i] },
];

function matchAll(text, patterns) {
  return patterns.every((pattern) => pattern.test(text));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const productDiagnostics = { consoleErrors: [], failedRequests: [], unauthorizedResponses: [], reportingResponses: [], recoveryResponses: [] };
const reportingRequestRoutes = new WeakMap();
page.on("console", (message) => {
  if (message.type() === "error") productDiagnostics.consoleErrors.push(message.text());
});
page.on("requestfailed", (request) => {
  const errorText = request.failure()?.errorText;
  if (errorText && errorText !== "net::ERR_ABORTED" && request.url().includes("/api/")) {
    productDiagnostics.failedRequests.push(`${request.method()} ${request.url()} :: ${errorText}`);
  }
});
page.on("response", (response) => {
  const request = response.request();
  const url = new URL(response.url());
  if (url.pathname === "/api/odoo/reporting-dashboard") {
    productDiagnostics.reportingResponses.push({
      route: reportingRequestRoutes.get(request) ?? null,
      method: request.method(),
      status: response.status(),
      hours: url.searchParams.get("hours"),
    });
  }
  if (url.pathname === "/api/odoo/session" || url.pathname === "/api/auth/refresh") {
    productDiagnostics.recoveryResponses.push({
      route: reportingRequestRoutes.get(request) ?? null,
      path: url.pathname,
      method: request.method(),
      status: response.status(),
    });
  }
  if (response.status() === 401) {
    productDiagnostics.unauthorizedResponses.push({
      route: reportingRequestRoutes.get(request) ?? null,
      method: request.method(),
      path: url.pathname,
      resourceType: request.resourceType(),
    });
  }
});
page.on("request", (request) => {
  if (new URL(request.url()).pathname !== "/api/odoo/reporting-dashboard") return;
  try {
    reportingRequestRoutes.set(request, new URL(request.frame().url()).pathname);
  } catch {
    reportingRequestRoutes.set(request, null);
  }
});

// Authenticate via the same-origin login endpoint so browser autofill and
// form navigation cannot turn a credential failure into a misleading timeout.
const loginResponse = await context.request.post(`${base}/api/auth/login`, {
  data: { username: "admin", password },
  headers: { Origin: base },
});
const loginBody = await loginResponse.json().catch(() => ({}));
if (!loginResponse.ok() || loginBody.code !== 0) {
  throw new Error(`Pilot page matrix login failed (${loginResponse.status()}): ${loginBody.message || "unknown error"}`);
}
await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
if (new URL(page.url()).pathname === "/login") throw new Error("Login API succeeded but browser session was not established");

const matrix = [];
const uiChecks = [];
for (const entry of pages) {
  await page.goto(`${base}${entry.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  let text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  // Odoo-backed pages hydrate after the shell. Retry the content assertion
  // briefly so a slow API response does not turn a loading state into a false failure.
  for (let attempt = 0; attempt < 8 && !matchAll(text, entry.expect); attempt++) {
    await page.waitForTimeout(1000);
    text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  }
  if (entry.path === "/overview") {
    try {
      if (!productDiagnostics.reportingResponses.some((response) => response.route === "/overview" && response.status === 200)) {
        await page.waitForResponse((response) => {
          const url = new URL(response.url());
          return url.pathname === "/api/odoo/reporting-dashboard" && response.ok();
        }, { timeout: 30000 });
      }
      const firstLoadUnauthorized = productDiagnostics.reportingResponses.some((response) => response.route === "/overview" && response.status === 401);
      if (firstLoadUnauthorized) throw new Error("Overview report request received 401 before session warm-up");
      uiChecks.push({ name: "Overview restores Odoo session before loading reports", status: "PASS", evidence: "The first reporting-dashboard request succeeded without a transient 401." });
    } catch (error) {
      uiChecks.push({ name: "Overview restores Odoo session before loading reports", status: "FAIL", evidence: error instanceof Error ? error.message : "Unexpected failure" });
    }
  }
  const pass = matchAll(text, entry.expect);
  if (entry.path === "/products/odoo") {
    const api = await context.request.post(`${base}/api/odoo/records`, {
      data: { type: "products", limit: 40 },
      headers: { Origin: base },
    });
    const apiBody = await api.json().catch(() => ({}));
    console.log("PRODUCT_DEBUG", JSON.stringify({
      status: api.status(),
      apiCode: apiBody.code,
      apiMessage: apiBody.message,
      itemCount: apiBody.items?.length,
      itemNames: apiBody.items?.map((item) => item.name),
      body: text,
      consoleErrors: productDiagnostics.consoleErrors,
      failedRequests: productDiagnostics.failedRequests,
      unauthorizedResponses: productDiagnostics.unauthorizedResponses,
      reportingResponses: productDiagnostics.reportingResponses,
      recoveryResponses: productDiagnostics.recoveryResponses,
    }));
  }
  if (entry.path === "/reports/dashboard") {
    try {
      const launcher = page.getByRole("button", { name: "Open Orithos AI assistant" });
      await launcher.waitFor({ timeout: 10000 });
      await launcher.click();
      await page.getByRole("dialog", { name: "Orithos AI assistant" }).waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Close assistant" }).click();
      uiChecks.push({ name: "Reporting AI entry and panel interaction", status: "PASS", evidence: "The reporting header entry opens and closes the assistant without submitting a prompt." });
    } catch (error) {
      uiChecks.push({ name: "Reporting AI entry and panel interaction", status: "FAIL", evidence: error instanceof Error ? error.message : "Unexpected failure" });
    }
  }
  matrix.push({
    path: entry.path,
    status: pass ? "PASS" : "FAIL",
    snippet: text.slice(0, 220),
  });
  if (entry.path === "/") {
    try {
      const launcher = page.getByRole("button", { name: "Open Orithos AI assistant" });
      await launcher.waitFor({ timeout: 10000 });
      if (await launcher.getAttribute("tabindex") !== "-1") {
        throw new Error("Checkout AI entry must stay outside the sale keyboard-tab sequence");
      }
      await launcher.click();
      await page.getByRole("dialog", { name: "Orithos AI assistant" }).waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Close assistant" }).click();
      await launcher.waitFor({ timeout: 10000 });
      uiChecks.push({ name: "Checkout AI entry and panel interaction", status: "PASS", evidence: "The header entry is excluded from the checkout keyboard-tab sequence; it opens and closes the assistant without submitting a prompt." });
    } catch (error) {
      uiChecks.push({ name: "Checkout AI entry and panel interaction", status: "FAIL", evidence: error instanceof Error ? error.message : "Unexpected failure" });
    }
  }
  if (entry.path === "/customers/odoo") {
    try {
      const launcher = page.getByRole("button", { name: "Open Orithos AI assistant" });
      await launcher.waitFor({ timeout: 10000 });
      await launcher.click();
      await page.getByRole("dialog", { name: "Orithos AI assistant" }).waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Close assistant" }).click();
      await launcher.waitFor({ timeout: 10000 });
      uiChecks.push({ name: "Customers AI entry and panel interaction", status: "PASS", evidence: "The customers header entry opens and closes the assistant without submitting a prompt." });
    } catch (error) {
      uiChecks.push({ name: "Customers AI entry and panel interaction", status: "FAIL", evidence: error instanceof Error ? error.message : "Unexpected failure" });
    }
  }
  if (entry.path === "/products/odoo") {
    try {
      const launcher = page.getByRole("button", { name: "Open Orithos AI assistant" });
      await launcher.waitFor({ timeout: 10000 });
      await launcher.click();
      await page.getByRole("dialog", { name: "Orithos AI assistant" }).waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Close assistant" }).click();
      await launcher.waitFor({ timeout: 10000 });
      uiChecks.push({ name: "Products AI entry and panel interaction", status: "PASS", evidence: "The products header entry opens and closes the assistant without submitting a prompt." });
    } catch (error) {
      uiChecks.push({ name: "Products AI entry and panel interaction", status: "FAIL", evidence: error instanceof Error ? error.message : "Unexpected failure" });
    }
  }
  console.log(`${pass ? "PASS" : "FAIL"} ${entry.path} :: ${text.slice(0, 140)}`);
}

try {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/overview`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }).waitFor({ timeout: 20000 });
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  if (dimensions.page > dimensions.viewport) throw new Error(`Overview overflows horizontally: ${dimensions.page}px > ${dimensions.viewport}px`);
  uiChecks.push({ name: "Overview mobile layout", status: "PASS", evidence: `390px viewport has no horizontal page overflow (${dimensions.page}px content).` });
} catch (error) {
  uiChecks.push({ name: "Overview mobile layout", status: "FAIL", evidence: error instanceof Error ? error.message : "Unexpected failure" });
}
await page.setViewportSize({ width: 1440, height: 900 });

// Roles: exercise permission assignment through the UI, verify the stored
// grant through the API, and always clean up the unique test role.
let roleResult = "SKIP";
let temporaryRoleId;
let roleName;
try {
  roleName = `Pilot UAT ${Date.now().toString().slice(-6)}`;
  await page.goto(`${base}/settings/roles`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: /New role/i }).click();
  await page.getByLabel(/Role name/i).fill(roleName);
  const permissionsResponse = await context.request.get(`${base}/api/permissions`);
  const permissionsBody = await permissionsResponse.json();
  if (!permissionsResponse.ok() || permissionsBody.code !== 0) throw new Error(`Permission list failed: ${permissionsBody.message}`);
  const firstPermission = (permissionsBody.data || permissionsBody.items || [])[0];
  if (!firstPermission) throw new Error("No permissions are available for role UAT");
  const firstCheckbox = page.locator('input[type="checkbox"]').first();
  await firstCheckbox.check();
  await page.getByRole("button", { name: /Save role/i }).click();
  await page.getByText(roleName, { exact: true }).waitFor({ timeout: 20000 });
  const rolesResponse = await context.request.get(`${base}/api/roles`);
  const rolesBody = await rolesResponse.json();
  temporaryRoleId = (rolesBody.data || []).find((role) => role.name === roleName)?.id;
  if (!temporaryRoleId) throw new Error("Created role was not returned by the role API");
  const assignedResponse = await context.request.get(`${base}/api/roles/${temporaryRoleId}/permissions`);
  const assignedBody = await assignedResponse.json();
  if (!assignedResponse.ok() || !(assignedBody.data || []).some((permission) => permission.id === firstPermission.id)) {
    throw new Error("The UI permission grant was not saved");
  }
  await page.locator("tr", { hasText: roleName }).getByText(firstPermission.name, { exact: true }).waitFor({ timeout: 15000 });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `Delete ${roleName} role` }).click();
  await page.getByText(roleName, { exact: true }).waitFor({ state: "detached", timeout: 20000 });
  temporaryRoleId = undefined;
  roleResult = "CREATED_PERMISSION_SAVED_DELETED";
} catch (error) {
  roleResult = `ERROR:${error.message}`;
} finally {
  if (!temporaryRoleId && roleName) {
    const rolesResponse = await context.request.get(`${base}/api/roles`).catch(() => null);
    const rolesBody = await rolesResponse?.json().catch(() => null);
    temporaryRoleId = (rolesBody?.data || []).find((role) => role.name === roleName)?.id;
  }
  if (temporaryRoleId) {
    const deletion = await context.request.delete(`${base}/api/roles/${temporaryRoleId}`);
    const deletedBody = await deletion.json().catch(() => ({}));
    if (!deletion.ok() || deletedBody.code !== 0) roleResult = `CLEANUP_FAIL:${deletedBody.message || deletion.status()}`;
  }
}
console.log("ROLE_CRUD", roleResult);

const outPath = path.join(root, "docs", "UAT_PAGE_MATRIX_2026-10-13.json");
fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), deployment: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), roleResult, matrix, uiChecks, unauthorizedResponses: productDiagnostics.unauthorizedResponses, reportingResponses: productDiagnostics.reportingResponses, recoveryResponses: productDiagnostics.recoveryResponses }, null, 2));
console.log("WROTE", outPath);

await browser.close();
const failed = matrix.filter((row) => row.status === "FAIL");
const failedUiChecks = uiChecks.filter((check) => check.status === "FAIL");
process.exit(failed.length || failedUiChecks.length ? 2 : 0);
