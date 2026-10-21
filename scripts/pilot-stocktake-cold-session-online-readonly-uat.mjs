/** Verify stocktake can recover an Odoo session on first page load. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_STOCKTAKE_COLD_SESSION_DEMO_CURRENT.json");
const browser = await chromium.launch({ headless: true });
const checks = [], apiResponses = [], blockedWrites = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const login = await context.request.post(`${base}/api/auth/login`, { data: { username: "admin", password }, headers: { Origin: base }, timeout: 60000 });
  const payload = await login.json().catch(() => ({}));
  if (!login.ok() || payload.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      blockedWrites.push({ method: request.method(), path: pathname });
      return route.fulfill({ status: 405, json: { code: 40500, message: "Read-only UAT blocks this request" } });
    }
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { const pathname = new URL(response.url()).pathname; if (pathname.startsWith("/api/odoo/")) apiResponses.push({ path: pathname, status: response.status() }); });
  await page.goto(`${base}/stock/stocktake?__uat_cold=${Date.now()}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByRole("heading", { name: "Odoo Stocktake" }).waitFor({ timeout: 30000 });
  const location = page.locator("#stocktake-location");
  await location.waitFor({ timeout: 30000 });
  checks.push({ name: "stocktake cold entry recovers Odoo read", status: errors.length === 0 && await location.isVisible() ? "PASS" : "FAIL", errors, apiResponses });
  await page.screenshot({ path: path.join(root, "docs/screenshots/2026-10-21-stocktake-cold-session-demo.png"), fullPage: true });
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await context.close();
} catch (error) { checks.push({ name: "cold session run", status: "FAIL", evidence: error instanceof Error ? error.message : "Unexpected failure", apiResponses }); }
finally { await browser.close(); }
const output = { generatedAt: new Date().toISOString(), sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), deployment: "runtime-identity-unverified", target: base, scope: "Authenticated Demo cold stocktake page; GET-only browser observation; no business writes", status: checks.every((check) => check.status === "PASS") && blockedWrites.length === 0 ? "PASS" : "FAIL", checks, blockedWrites };
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, blockedWrites: blockedWrites.length }));
if (output.status !== "PASS") process.exitCode = 1;
