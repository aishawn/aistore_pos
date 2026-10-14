import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
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
    const countedCash = page.getByLabel("Counted cash (required)");
    await countedCash.waitFor({ timeout: 10000 });
    if (await countedCash.getAttribute("required") === null) throw new Error("Cash count input is not marked required");
    const closeButton = page.getByRole("button", { name: "Review before closing" });
    if (await closeButton.isEnabled()) throw new Error("Register close is enabled before a cash count is entered");
    await countedCash.fill("0.00");
    if (!(await closeButton.isEnabled())) throw new Error("Entering a cash count did not enable the close confirmation");
    await closeButton.click();
    const dialog = page.getByRole("alertdialog", { name: "Close this Odoo session?" });
    await dialog.waitFor({ timeout: 10000 });
    const copy = await dialog.innerText();
    if (!copy.includes("00004") || !copy.includes("reconciled") || !copy.includes("$0.00")) throw new Error("Confirmation did not identify the session, reconciliation check, and entered cash count");
    await dialog.getByRole("button", { name: "Keep session open" }).click();
    await dialog.waitFor({ state: "detached", timeout: 10000 });
    await page.locator("dd").filter({ hasText: "00004" }).first().waitFor({ timeout: 10000 });
    const configId = Number(await page.locator("select").first().inputValue());
    const rejectedClose = await context.request.post(base + "/api/odoo/session/close", {
      data: { configId, countedCash: null },
      headers: { Origin: base },
    });
    const rejectedBody = await rejectedClose.json().catch(() => ({}));
    if (rejectedClose.status() !== 422 || !/Count the cash in the drawer/i.test(rejectedBody.message || "")) {
      throw new Error("Server did not reject close without counted cash (HTTP " + rejectedClose.status() + ")");
    }
    const bootstrapResponse = await context.request.get(base + "/api/odoo/pos-bootstrap");
    const bootstrap = await bootstrapResponse.json();
    const activeSession = bootstrap.configs?.find((config) => config.id === configId)?.session;
    if (!String(activeSession?.name || "").endsWith("/00004") || activeSession?.state !== "opened") {
      throw new Error("Rejected close attempt changed the open register session");
    }
    return "Cash count is required before close; the UI confirmation was cancelled, and a direct API close without cash returned 422 before any Odoo write. Session 00004 remains open.";
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
    if (dataRows === 0 && !bodyText.includes("No matching purchases")) {
      const emptyStateKind = bodyText.includes("No purchase orders yet") ? "unfiltered-empty-copy" : bodyText.includes("Loading purchases") ? "loading-copy" : bodyText.trim() ? "unexpected-copy" : "blank";
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

const output = { generatedAt: new Date().toISOString(), deployment: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), scope: "read-only production validation; no purchase order confirmed; close UI was cancelled; an invalid close request was rejected before any Odoo write", checks };
const outputPath = path.join(root, "docs", "UAT_OPS_READONLY_2026-10-13.json");
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ outputPath, passed: checks.filter((item) => item.status === "PASS").length, failed: checks.filter((item) => item.status === "FAIL").length, checks }));
if (checks.some((item) => item.status === "FAIL")) process.exitCode = 2;
