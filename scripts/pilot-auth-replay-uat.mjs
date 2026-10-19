import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au";
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const checks = [];
const writes = [];
let refreshRequests = 0;
let priceSetReads = 0;
let priceSetDeletes = 0;

try {
  const subdomain = process.env.PILOT_SUBDOMAIN ?? env.PILOT_SUBDOMAIN ?? "demo";
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password, subdomain },
    headers: { Origin: base, "X-Orithos-Tenant-Slug": subdomain },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  await context.route("**/api/auth/refresh", async (route) => {
    refreshRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data: null }) });
  });
  await context.route("**/api/price-sets", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    priceSetReads += 1;
    if (priceSetReads === 1) {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: 40100, message: "Injected expired access token" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data: [{ id: 77, name: "Mock Wholesale", parentId: null }] }) });
  });
  await context.route("**/api/price-sets/77", async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    priceSetDeletes += 1;
    writes.push(`${route.request().method()} /api/price-sets/77`);
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: 40100, message: "Injected expired access token" }) });
  });

  const page = await context.newPage();
  await page.goto(`${base}/settings/pricesets`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: "Price Sets", exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Delete price set", exact: true }).click();
  await page.waitForTimeout(1000);

  checks.push({
    name: "GET refreshes once after 401",
    status: priceSetReads >= 2 && refreshRequests === 1 ? "PASS" : "FAIL",
    evidence: { priceSetReads, refreshRequests },
  });
  checks.push({
    name: "DELETE is not replayed after 401",
    status: priceSetDeletes === 1 ? "PASS" : "FAIL",
    evidence: { priceSetDeletes },
  });
} finally {
  try { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); } catch { /* Session expires normally. */ }
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  deployment: process.env.PILOT_DEPLOYMENT_VERIFIED === "true" && /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
    ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase()
    : "unverified-after-deploy",
  target: base,
  scope: "read-only auth recovery injection; GET is replayed once, DELETE is intercepted and never replayed",
  checks,
  writes,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AUTH_REPLAY_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, checks, writes }));
if (checks.some((check) => check.status !== "PASS") || writes.length !== 1) process.exitCode = 2;
