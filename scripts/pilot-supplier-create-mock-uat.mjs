import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}));
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");

const base = "https://app.orithos.com.au";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
try {
  const login = await context.request.post(`${base}/api/auth/login`, { data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD }, headers: { Origin: base } });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error("Supplier UAT login failed");

  const page = await context.newPage();
  const submissions = [];
  let hasCreatedFixture = false;
  await page.route("**/api/odoo/session**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: 1, name: "UAT" }, autoRecoverConfigured: true }) }));
  await page.route("**/api/odoo/records", (route) => {
    const items = hasCreatedFixture ? [{ id: 999001, name: "UAT Winery Group (fixture only)", phone: "+61 2 5550 0100", email: "vendor-uat@example.invalid", vat: "53004085616", ref: "UAT-ONLY", supplier_rank: 1 }] : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items, limit: 40, offset: 0 }) });
  });
  await page.route("**/api/odoo/suppliers", async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ status: 405, body: "Unexpected method" });
    const submitted = route.request().postDataJSON();
    submissions.push(submitted);
    if (submitted.vat === "53004085616") return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "ABN / Tax ID already belongs to UAT Existing Supplier (fixture only) (existing supplier). Review that record before continuing." }) });
    hasCreatedFixture = true;
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: 999001, name: submitted.name }) });
  });
  await page.goto(`${base}/suppliers/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const initialLayout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  if (initialLayout.viewport !== 390 || initialLayout.document > initialLayout.viewport) throw new Error(`Supplier directory overflows at mobile width: ${JSON.stringify(initialLayout)}`);
  if (await page.locator("table").isVisible().catch(() => false)) throw new Error("Supplier table should be replaced by mobile cards below xl width");
  await page.getByRole("button", { name: "Add supplier" }).click();
  const dialog = page.getByRole("dialog", { name: "Add supplier to Odoo" });
  await dialog.waitFor({ timeout: 10000 });
  const dialogBox = await dialog.boundingBox();
  if (!dialogBox || dialogBox.width > 390 || dialogBox.height > 844) throw new Error(`Supplier dialog does not fit mobile viewport: ${JSON.stringify(dialogBox)}`);
  await dialog.getByLabel(/Business name/).fill("UAT Winery Group (fixture only)");
  await dialog.getByLabel("Phone").fill("+61 2 5550 0100");
  await dialog.getByLabel("Email").fill("not-an-email");
  await dialog.getByLabel("ABN / Tax ID").fill("53004085616");
  await dialog.getByLabel("Internal reference").fill("UAT-ONLY");
  await dialog.getByRole("button", { name: "Create supplier" }).click();
  await page.waitForTimeout(300);
  if (submissions.length !== 0) throw new Error("Invalid email unexpectedly submitted a supplier request");
  await dialog.getByLabel("Email").fill("vendor-uat@example.invalid");
  await dialog.getByRole("button", { name: "Create supplier" }).click();
  await dialog.getByRole("alert").getByText("ABN / Tax ID already belongs to UAT Existing Supplier (fixture only) (existing supplier). Review that record before continuing.").waitFor({ timeout: 10000 });
  if (submissions.length !== 1) throw new Error("Duplicate ABN was not sent exactly once to the intercepted API");
  await dialog.getByLabel("ABN / Tax ID").fill("53004085617");
  await dialog.getByRole("button", { name: "Create supplier" }).click();
  await dialog.waitFor({ state: "detached", timeout: 10000 });
  const submitted = submissions[1];
  if (submissions.length !== 2 || !submitted || submitted.name !== "UAT Winery Group (fixture only)" || submitted.vat !== "53004085617" || submitted.ref !== "UAT-ONLY") throw new Error(`Supplier create payload mismatch: ${JSON.stringify(submissions)}`);
  const card = page.locator("article", { hasText: "UAT Winery Group (fixture only)" });
  await card.waitFor({ timeout: 10000 });
  if (!(await card.locator('a[href^="tel:"]').count()) || !(await card.locator('a[href^="mailto:"]').count())) throw new Error("Mobile supplier card is missing tap-to-call or email links");
  if (!(await card.locator("p").filter({ hasText: "UAT Winery Group (fixture only)" }).count())) throw new Error("Mobile supplier card is missing the supplier name");
  const output = { generatedAt: new Date().toISOString(), deployment: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), status: "PASS", viewport: 390, fixture: "create API intercepted; no Odoo write", checks: ["mobile supplier directory has no horizontal overflow", "mobile card replaces wide supplier table", "supplier create dialog fits mobile viewport", "browser rejects malformed email before API", "duplicate ABN response is shown and form remains editable", "unique ABN and contact fields submit", "created supplier fixture appears with tap-to-call and email links"] };
  const outputPath = path.join(root, "docs", "UAT_SUPPLIER_MOBILE_2026-10-14.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, ...output }));
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await browser.close();
}
