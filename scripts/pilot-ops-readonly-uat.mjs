import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = "https://app.orithos.com.au";
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const checks = [];
const purchaseStatesRequested = [];
page.on("request", (request) => {
  const url = new URL(request.url());
  if (url.pathname === "/api/odoo/purchase-orders") purchaseStatesRequested.push(url.searchParams.get("state") || "all");
});
async function check(name, run) { try { checks.push({ name, status: "PASS", evidence: await run() }); } catch (error) { checks.push({ name, status: "FAIL", evidence: error instanceof Error ? error.message : "Unexpected failure" }); } }

try {
  const login = await context.request.post(base + "/api/auth/login", { data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD }, headers: { Origin: base } });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error("Production UAT login failed");

  await check("Integrations displays automatic Odoo recovery and the live POS session", async () => {
    await page.goto(base + "/settings/integrations", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByText("Connected", { exact: true }).waitFor({ timeout: 20000 });
    await page.getByText(/Odoo auto-reconnect is on/i).waitFor({ timeout: 10000 });
    await page.getByText(/Open · .*00004/).waitFor({ timeout: 10000 });
    return "Connected status, auto-reconnect message, and opened session 00004 were visible.";
  });

  await check("Close-register confirmation is explicit and safely cancellable", async () => {
    await page.goto(base + "/close", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("dd").filter({ hasText: "00004" }).first().waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Close register in Odoo" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Close this Odoo session?" });
    await dialog.waitFor({ timeout: 10000 });
    const copy = await dialog.innerText();
    if (!copy.includes("00004") || !copy.includes("reconciled")) throw new Error("Confirmation did not identify session and reconciliation check");
    await dialog.getByRole("button", { name: "Keep session open" }).click();
    await dialog.waitFor({ state: "detached", timeout: 10000 });
    await page.locator("dd").filter({ hasText: "00004" }).first().waitFor({ timeout: 10000 });
    return "Session 00004 was named in the confirmation; cancel returned to the open session. No close request was sent.";
  });

  await check("Purchase status filter refreshes Odoo results and detail is view-only", async () => {
    const initialPurchaseResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/odoo/purchase-orders");
    await page.goto(base + "/purchases/odoo", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: "Purchases" }).waitFor({ timeout: 20000 });
    const initialResponse = await initialPurchaseResponse;
    if (!initialResponse.ok()) throw new Error("Initial purchase list request returned HTTP " + initialResponse.status());
    await page.waitForFunction(() => {
      const table = document.querySelector("tbody");
      return Boolean(table && !table.innerText.includes("Loading purchases"));
    }, null, { timeout: 20000 });
    const status = page.getByLabel("Status");
    await status.selectOption("draft");
    if (await status.inputValue() !== "draft") throw new Error("Draft filter did not remain selected");
    await page.waitForTimeout(1500);
    if (!purchaseStatesRequested.includes("draft")) throw new Error("Draft status selection did not issue an Odoo purchase-list request");
    const bodyText = await page.locator("tbody").innerText();
    const viewButtons = page.getByRole("button", { name: "View" });
    const dataRows = await viewButtons.count();
    if (dataRows === 0 && !bodyText.includes("No purchase orders match these filters.")) {
      const emptyStateKind = bodyText.includes("No RFQs or purchase orders") ? "unfiltered-empty-copy" : bodyText.includes("Loading purchases") ? "loading-copy" : bodyText.trim() ? "unexpected-copy" : "blank";
      throw new Error("Draft RFQ filter returned no View buttons; empty state=" + emptyStateKind + ", table row count=" + await page.locator("tbody > tr").count() + ", requested states=" + purchaseStatesRequested.join(","));
    }
    let detailOpened = false;
    if (dataRows > 0) {
      await viewButtons.first().click();
      const detail = page.getByRole("dialog", { name: "Purchase details" });
      await detail.waitFor({ timeout: 15000 });
      if (await page.getByRole("alertdialog", { name: "Confirm this purchase order?" }).count()) throw new Error("Opening purchase details unexpectedly opened the write-confirmation dialog");
      detailOpened = true;
      await detail.getByRole("button", { name: "Close" }).click();
    }
    return "Draft filter rendered " + dataRows + " row(s)" + (detailOpened ? "; first purchase detail opened and closed without confirmation." : "; explicit empty state shown.");
  });
} finally {
  try { await context.request.post(base + "/api/auth/logout", { headers: { Origin: base } }); } catch { /* Session expires normally. */ }
  await browser.close();
}

const output = { generatedAt: new Date().toISOString(), scope: "read-only production validation; close confirmation opened then cancelled; no purchase order confirmed and no register-close request sent", checks };
const outputPath = path.join(root, "docs", "UAT_OPS_READONLY_2026-10-13.json");
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ outputPath, passed: checks.filter((item) => item.status === "PASS").length, failed: checks.filter((item) => item.status === "FAIL").length, checks }));
if (checks.some((item) => item.status === "FAIL")) process.exitCode = 2;
