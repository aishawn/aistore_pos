/** Read-only Demo check for purchase AI placement and mobile layout. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = process.env.PILOT_ENV_FILE ?? path.join(root, ".env");
const envText = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
const env = Object.fromEntries(envText.split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_PURCHASE_AI_PLACEMENT_DEMO_CURRENT.json");
const browser = await chromium.launch({ headless: true });
const checks = [], blockedWrites = [];
fs.mkdirSync(path.join(root, "docs/screenshots/2026-10-21-purchase-ai-placement-demo"), { recursive: true });
try {
  const context = await browser.newContext();
  const login = await context.request.post(`${base}/api/auth/login`, { data: { username: "admin", password }, headers: { Origin: base }, timeout: 60000 });
  const loginPayload = await login.json().catch(() => ({}));
  if (!login.ok() || loginPayload.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      blockedWrites.push({ method: request.method(), path: new URL(request.url()).pathname });
      return route.fulfill({ status: 405, json: { code: 40500, message: "Read-only UAT blocks this request" } });
    }
    return route.continue();
  });
  for (const width of [390, 1440]) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/purchases/odoo`, { waitUntil: "networkidle", timeout: 60000 });
    const header = await page.getByRole("button", { name: "Open Orithos AI assistant", exact: true }).count();
    const floating = await page.getByRole("button", { name: "Open Orithos AI", exact: true }).count();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const orderButtons = await page.getByRole("button").filter({ hasText: /^PO\// }).count();
    checks.push({ viewport: width, actualViewport: await page.evaluate(() => innerWidth), name: "purchase list AI placement and responsive shell", status: header === 1 && floating === 0 && !overflow && errors.length === 0 ? "PASS" : "FAIL", header, floating, overflow, orderButtons, errors, path: new URL(page.url()).pathname });
    await page.screenshot({ path: path.join(root, "docs", "screenshots", "2026-10-21-purchase-ai-placement-demo", `purchase-${width}.png`), fullPage: true });
    await page.close();
  }
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await context.close();
} catch (error) { checks.push({ name: "run", status: "FAIL", evidence: error instanceof Error ? error.message : "Unexpected failure" }); }
finally { await browser.close(); }
const output = { generatedAt: new Date().toISOString(), sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), deployment: "runtime-identity-unverified", target: base, scope: "Authenticated Demo read-only purchase list; GET-only browser observation; no purchase/receipt writes", status: checks.every((check) => check.status === "PASS") && blockedWrites.length === 0 ? "PASS" : "FAIL", checks, blockedWrites };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, blockedWrites: blockedWrites.length }));
if (output.status !== "PASS") process.exitCode = 1;
