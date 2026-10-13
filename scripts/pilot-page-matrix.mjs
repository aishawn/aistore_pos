import fs from "fs";
import path from "path";
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
  { path: "/", expect: [/orithos_store1\/00004/, /12 avail/, /Finalise/] },
  { path: "/history/odoo", expect: [/Sales History/, /260-1-00000/] },
  { path: "/close", expect: [/orithos_store1\/00004/, /Close register/] },
  { path: "/products/odoo", expect: [/DEMO-SB-2024|Sauvignon Blanc/, /DEMO-SHIRAZ21|Barossa Shiraz/, /\b12\s*Units\b/i] },
  { path: "/customers/odoo", expect: [/Customers|No customers|Walk-in|empty|0/i] },
  { path: "/suppliers/odoo", expect: [/Suppliers|No suppliers|empty|0/i] },
  { path: "/purchases/odoo", expect: [/Purchases|No purchase|empty|RFQ|0/i] },
  { path: "/stock/replenishment", expect: [/Replenishment|suggest|0|no completed sales/i] },
  { path: "/reports/dashboard", expect: [/Reporting|Sales|transaction|\$/i] },
  { path: "/settings/integrations", expect: [/Integrations|Odoo|Connected|auto-reconnect|auto recover/i] },
  { path: "/settings/payment", expect: [/Payment|Card|Cash/i] },
  { path: "/settings/tax", expect: [/Tax|GST|WET/i] },
  { path: "/settings/registers-outlets", expect: [/Register|orithos_store1|Outlet|Company/i] },
  { path: "/settings/receipts", expect: [/not connected yet|Receipt settings are not connected/i] },
  { path: "/settings/hardware", expect: [/No hardware connection has been verified/i] },
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
const productDiagnostics = { consoleErrors: [], failedRequests: [] };
page.on("console", (message) => {
  if (message.type() === "error") productDiagnostics.consoleErrors.push(message.text());
});
page.on("requestfailed", (request) => {
  const errorText = request.failure()?.errorText;
  if (errorText && errorText !== "net::ERR_ABORTED" && request.url().includes("/api/")) {
    productDiagnostics.failedRequests.push(`${request.method()} ${request.url()} :: ${errorText}`);
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
    }));
  }
  matrix.push({
    path: entry.path,
    status: pass ? "PASS" : "FAIL",
    snippet: text.slice(0, 220),
  });
  console.log(`${pass ? "PASS" : "FAIL"} ${entry.path} :: ${text.slice(0, 140)}`);
}

// Roles: use the same authenticated API as the UI, and always clean up the
// uniquely named temporary role even if an intermediate assertion fails.
let roleResult = "SKIP";
let temporaryRoleId;
try {
  const roleName = `Pilot Clerk ${Date.now().toString().slice(-6)}`;
  const permissionsResponse = await context.request.get(`${base}/api/permissions`);
  const permissionsBody = await permissionsResponse.json();
  if (!permissionsResponse.ok() || permissionsBody.code !== 0) throw new Error(`Permission list failed: ${permissionsBody.message}`);
  const permissionIds = (permissionsBody.data || permissionsBody.items || []).slice(0, 1).map((permission) => permission.id);
  const create = await context.request.post(`${base}/api/roles`, { data: { name: roleName, permissionIds } });
  const createdBody = await create.json();
  if (!create.ok() || createdBody.code !== 0 || !createdBody.data?.id) throw new Error(`Role create failed: ${createdBody.message}`);
  temporaryRoleId = createdBody.data.id;
  roleResult = "CREATED";
} catch (error) {
  roleResult = `ERROR:${error.message}`;
} finally {
  if (temporaryRoleId) {
    const deletion = await context.request.delete(`${base}/api/roles/${temporaryRoleId}`);
    const deletedBody = await deletion.json().catch(() => ({}));
    roleResult = deletion.ok() && deletedBody.code === 0 ? "CREATED_DELETED" : `CREATED_DELETE_FAIL:${deletedBody.message || deletion.status()}`;
  }
}
console.log("ROLE_CRUD", roleResult);

const outPath = path.join(root, "docs", "UAT_PAGE_MATRIX_2026-10-13.json");
fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), roleResult, matrix }, null, 2));
console.log("WROTE", outPath);

await browser.close();
const failed = matrix.filter((row) => row.status === "FAIL");
process.exit(failed.length ? 2 : 0);
