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
  { path: "/products/odoo", expect: [/DEMO-SB-2024|Sauvignon Blanc/, /DEMO-SHIRAZ21|Barossa Shiraz/, /\b12\b/] },
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

await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.getByPlaceholder("Username").fill("admin");
await page.getByPlaceholder("Password").fill(password);
await page.getByRole("button", { name: "Login" }).click();
await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30000 });

const matrix = [];
for (const entry of pages) {
  await page.goto(`${base}${entry.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const pass = matchAll(text, entry.expect);
  matrix.push({
    path: entry.path,
    status: pass ? "PASS" : "FAIL",
    snippet: text.slice(0, 220),
  });
  console.log(`${pass ? "PASS" : "FAIL"} ${entry.path} :: ${text.slice(0, 140)}`);
}

// Roles: create a temporary role with one permission if possible, then delete.
let roleResult = "SKIP";
try {
  await page.goto(`${base}/settings/roles`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /New role/i }).click();
  await page.waitForTimeout(500);
  const roleName = `Pilot Clerk ${Date.now().toString().slice(-6)}`;
  await page.getByLabel(/Role name/i).fill(roleName);
  const firstCheckbox = page.locator('input[type="checkbox"]').first();
  if (await firstCheckbox.count()) await firstCheckbox.check();
  await page.getByRole("button", { name: /Save role/i }).click();
  await page.waitForTimeout(2000);
  const body = await page.locator("body").innerText();
  if (body.includes(roleName)) {
    roleResult = "CREATED";
    const row = page.locator("tr", { hasText: roleName });
    await row.getByRole("button", { name: /Delete/i }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.waitForTimeout(1500);
    const after = await page.locator("body").innerText();
    roleResult = after.includes(roleName) ? "CREATED_DELETE_FAIL" : "CREATED_DELETED";
  } else {
    roleResult = "CREATE_FAIL";
  }
} catch (error) {
  roleResult = `ERROR:${error.message}`;
}
console.log("ROLE_CRUD", roleResult);

const outPath = path.join(root, "docs", "UAT_PAGE_MATRIX_2026-10-13.json");
fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), roleResult, matrix }, null, 2));
console.log("WROTE", outPath);

await browser.close();
const failed = matrix.filter((row) => row.status === "FAIL");
process.exit(failed.length ? 2 : 0);
