/** Verify generic api GETs recover an Odoo session before replaying a read. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
if (!new URL(base).hostname.endsWith(".localhost") && new URL(base).hostname !== "localhost") throw new Error("LOCAL_FIXTURE_TARGET_REQUIRED");
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_API_ODOO_SESSION_RECOVERY_LOCAL.json");
const browser = await chromium.launch({ headless: true });
const checks = [];
let stocktakeReads = 0;
let sessionReads = 0;
const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
await context.addInitScript(() => localStorage.setItem("sf_user", JSON.stringify({ id: 1, username: "admin", name: "Fixture Admin", isAdmin: true })));
await context.route("**/api/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === "/api/odoo/stocktake" && request.method() === "GET") {
    stocktakeReads += 1;
    if (stocktakeReads === 1) return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: 40100, message: "Odoo session expired", data: null }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: { locations: [{ id: 7101, name: "Main Warehouse" }], defaultLocationId: 7101, locationSource: "tenant-binding", writeEnabled: false, products: [] } }) });
  }
  if (url.pathname === "/api/odoo/session" && request.method() === "GET") {
    sessionReads += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: 1, username: "odoo", name: "Odoo Fixture" } }) });
  }
  if (request.method() !== "GET") return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "Writes blocked", data: null }) });
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: [] }) });
});
try {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/stock/stocktake?__uat_recovery=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: "Odoo Stocktake" }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  checks.push({ name: "Odoo session is recovered before replaying stocktake read", status: stocktakeReads === 2 && sessionReads === 1 ? "PASS" : "FAIL", stocktakeReads, sessionReads });
  checks.push({ name: "recovered page remains usable", status: page.url().endsWith("/stock/stocktake?__uat_recovery=" + new URL(page.url()).searchParams.get("__uat_recovery")) && errors.length === 0 ? "PASS" : "FAIL", errors });
  await page.screenshot({ path: path.join(root, "docs/screenshots/2026-10-21-api-odoo-session-recovery.png"), fullPage: true });
} catch (error) {
  checks.push({ name: "recovery run", status: "FAIL", evidence: error instanceof Error ? error.message : "Unexpected failure", stocktakeReads, sessionReads });
} finally { await context.close(); await browser.close(); }
const output = { generatedAt: new Date().toISOString(), sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), target: base, scope: "Local fixture: first Odoo read returns 401, session recovery returns user, read is replayed; no business writes", status: checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL", checks };
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length }));
if (output.status !== "PASS") process.exitCode = 1;
