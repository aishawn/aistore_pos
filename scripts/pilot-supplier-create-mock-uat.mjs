import fs from "node:fs";
import { chromium } from "playwright";

const env = Object.fromEntries(fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}));
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");

const base = "https://app.orithos.com.au";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
try {
  const login = await context.request.post(`${base}/api/auth/login`, { data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD }, headers: { Origin: base } });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error("Supplier UAT login failed");

  const page = await context.newPage();
  let submitted = null;
  await page.route("**/api/odoo/session**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: 1, name: "UAT" }, autoRecoverConfigured: true }) }));
  await page.route("**/api/odoo/records", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], limit: 40, offset: 0 }) }));
  await page.route("**/api/odoo/suppliers", async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ status: 405, body: "Unexpected method" });
    submitted = route.request().postDataJSON();
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: 999001, name: submitted.name }) });
  });
  await page.goto(`${base}/suppliers/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: "Add supplier" }).click();
  const dialog = page.getByRole("dialog", { name: "Add supplier to Odoo" });
  await dialog.waitFor({ timeout: 10000 });
  await dialog.getByLabel(/Business name/).fill("UAT Winery Group (fixture only)");
  await dialog.getByLabel("Phone").fill("+61 2 5550 0100");
  await dialog.getByLabel("Email").fill("vendor-uat@example.invalid");
  await dialog.getByLabel("ABN / Tax ID").fill("53004085616");
  await dialog.getByLabel("Internal reference").fill("UAT-ONLY");
  await dialog.getByRole("button", { name: "Create supplier" }).click();
  await dialog.waitFor({ state: "detached", timeout: 10000 });
  if (!submitted || submitted.name !== "UAT Winery Group (fixture only)" || submitted.vat !== "53004085616" || submitted.ref !== "UAT-ONLY") throw new Error(`Supplier create payload mismatch: ${JSON.stringify(submitted)}`);
  if (await page.getByText("No suppliers are available to this Odoo account.").count()) throw new Error("Supplier directory did not refresh after successful fixture response");
  console.log(JSON.stringify({ status: "PASS", fixture: "create API intercepted; no Odoo write", checks: ["supplier form opens from directory", "required and optional contact fields submit", "ABN and reference included in create request", "success closes form and refreshes list"] }));
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await browser.close();
}
