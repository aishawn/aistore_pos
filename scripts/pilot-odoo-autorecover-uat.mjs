import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = "https://app.orithos.com.au";
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");

const checks = [];
const record = (name, status, evidence) => checks.push({ name, status, evidence });
const getSession = async (context) => {
  const response = await context.request.get(`${base}/api/odoo/session`);
  return { status: response.status(), body: await response.json().catch(() => ({})) };
};
const waitForProductPageData = async (page, label) => {
  try {
    await page.waitForFunction(() => document.querySelector("tbody tr") || document.querySelector('[role="alert"]') || document.body.innerText.includes("Connect Odoo to view products"), undefined, { timeout: 30000 });
  } catch {
    throw new Error(`${label}: product page did not reach a data/error/connection state; body=${(await page.locator("main").innerText().catch(() => "<no main>" )).slice(0, 400)}`);
  }
  if (await page.getByRole("alert").count()) throw new Error(`${label}: ${(await page.getByRole("alert").innerText()).slice(0, 240)}; main=${(await page.locator("main").innerText().catch(() => "<no main>")).slice(0, 400)}`);
  if (await page.getByText("Connect Odoo to view products", { exact: true }).count()) throw new Error(`${label}: product page reports Odoo disconnected`);
  if (!(await page.locator("tbody tr").count())) throw new Error(`${label}: no product rows; page says ${(await page.locator("main").innerText()).slice(0, 300)}`);
};

const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error("Orithos login failed");
  record("Orithos admin login", "PASS", "Authenticated using the same-origin login API.");

  const before = await getSession(context);
  if (before.status !== 200 || before.body.autoRecoverConfigured !== true || !before.body.user) {
    throw new Error("Odoo auto-recovery is not configured or did not connect before session reset");
  }
  record("Odoo service-account recovery is configured", "PASS", "Production reports autoRecoverConfigured=true and an authenticated Odoo user.");

  const deleted = await context.request.delete(`${base}/api/odoo/session`, { headers: { Origin: base } });
  if (!deleted.ok()) throw new Error(`Could not clear the Odoo browser session (HTTP ${deleted.status()})`);
  record("Odoo browser session cleared", "PASS", "Same-origin session DELETE succeeded; this only clears the Odoo session cookie/session.");

  await page.goto(`${base}/stock/replenishment`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: "Replenishment plan" }).waitFor({ timeout: 30000 });
  if (await page.getByRole("heading", { name: "Connect Odoo to plan replenishment" }).count()) {
    throw new Error("The first Odoo-backed page after session removal still asks the user to connect manually");
  }
  record("First business page reconnects without manual Connect", "PASS", "After clearing the Odoo cookie, replenishment loaded through its data API and returned to the normal page without a manual connect action.");

  await page.goto(`${base}/products/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: "Products", exact: true }).waitFor({ timeout: 30000 });
  await waitForProductPageData(page, "Product catalogue initial load failed");
  const clearInPageSession = await page.evaluate(async () => {
    const response = await fetch("/api/odoo/session", { method: "DELETE", credentials: "same-origin", headers: { "Origin": location.origin } });
    return response.ok;
  });
  if (!clearInPageSession) throw new Error("Could not clear the Odoo browser session while the product page was open");
  const refreshedRecords = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/odoo/records" && response.status() === 200, { timeout: 30000 });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await refreshedRecords;
  await page.locator("tbody tr").first().waitFor({ timeout: 30000 });
  record("In-page read recovers and retries safely", "PASS", "With the products page already loaded, its read-only POST recovered an expired Odoo session and refreshed the catalogue without an error or manual reconnect.");

  const restored = await getSession(context);
  if (restored.status !== 200 || restored.body.autoRecoverConfigured !== true || !restored.body.user) {
    throw new Error("Odoo session was not restored automatically after cookie removal");
  }
  const bootstrapResponse = await context.request.get(`${base}/api/odoo/pos-bootstrap`);
  const bootstrap = await bootstrapResponse.json().catch(() => ({}));
  const session = (bootstrap.configs || []).map((config) => config.session).find((value) => value?.name?.endsWith("/00004"));
  if (!bootstrapResponse.ok() || session?.state !== "opened") {
    throw new Error("Automatic recovery did not preserve the expected opened POS session 00004");
  }
  record("Odoo reconnects automatically after session removal", "PASS", "Authenticated Odoo user restored; POS session orithos_store1/00004 remains opened.");
} catch (error) {
  record("Odoo auto-recovery regression", "FAIL", error instanceof Error ? error.message : "Unexpected failure");
} finally {
  try { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); } catch { /* Session expires normally. */ }
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  scope: "production Odoo session-cookie recovery only; no sale, inventory, purchase, refund, or register-close writes",
  checks,
};
const outputPath = path.join(root, "docs", "UAT_ODOO_AUTORECOVER_2026-10-13.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: checks.filter((check) => check.status === "PASS").length, failed: checks.filter((check) => check.status === "FAIL").length, checks }));
if (checks.some((check) => check.status === "FAIL")) process.exitCode = 2;
