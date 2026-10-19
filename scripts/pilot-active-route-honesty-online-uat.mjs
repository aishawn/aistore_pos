import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
const base = process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au";
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const cases = [
  { route: "/promotions", name: "promotions", required: ["This screen is read only"], forbidden: ["Add Promotion", "More Filters"] },
  { route: "/reports/favourites", name: "favourite-reports", required: ["Saved report favourites are not connected", "Open Reports Dashboard"], forbidden: ["Filter Report Types", "Filter Report Emailing"] },
  { route: "/media", name: "media", required: ["Media storage is not connected", "No files found"], forbidden: [] },
  { route: "/settings/registers-outlets", name: "registers-outlets", required: ["Live from Odoo", "Stores / companies", "POS registers"], forbidden: ["New Outlet", "New Register", "11 Example St"] },
  { route: "/security", name: "security", required: ["Security event monitoring is not connected", "Available security controls"], forbidden: ["Raw Events", "29/06/2026"] },
];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const login = await context.request.post(`${base}/api/auth/login`, { data: { username: "admin", password, subdomain: process.env.PILOT_SUBDOMAIN ?? env.PILOT_SUBDOMAIN ?? "demo" }, headers: { Origin: base, "X-Orithos-Tenant-Slug": "demo" } });
const body = await login.json().catch(() => ({}));
if (!login.ok() || body.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

const checks = [];
for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  const page = await context.newPage({ viewport });
  const pageErrors = [];
  const writes = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => { const pathname = new URL(request.url()).pathname; const readRpc = pathname === "/api/odoo/records"; if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && pathname !== "/cdn-cgi/rum" && !readRpc) writes.push(`${request.method()} ${pathname}`); });
  for (const item of cases) {
    const response = await page.goto(`${base}${item.route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(item.name === "registers-outlets" ? 2200 : 800);
    const text = await page.locator("body").innerText();
    const requiredMissing = item.required.filter((value) => !text.includes(value));
    if (item.name === "promotions" && !(await page.locator('input[aria-label="Search promotions by name"]').count())) requiredMissing.push("Search promotions by name");
    const forbiddenFound = item.forbidden.filter((value) => text.includes(value));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const disabledControls = item.name === "media" ? await page.locator("button:disabled, input:disabled").count() : null;
    const pass = response?.status() === 200 && !requiredMissing.length && !forbiddenFound.length && !overflow && !pageErrors.length && !writes.length && (item.name !== "media" || (disabledControls ?? 0) >= 2);
    checks.push({ route: item.route, viewport: viewport.width, status: response?.status() ?? 0, requiredMissing, forbiddenFound, disabledControls, overflow, pageErrors, nonGetRequests: [...writes], result: pass ? "PASS" : "FAIL" });
    console.log(`${pass ? "PASS" : "FAIL"} ${viewport.width} ${item.route}`);
  }
  await page.close();
}
await browser.close();
const failures = checks.filter((check) => check.result !== "PASS");
const output = { generatedAt: new Date().toISOString(), target: base, sourceCommit: process.env.PILOT_SOURCE_COMMIT ?? null, deploymentShaVerified: false, checksPassed: checks.length - failures.length, checksTotal: checks.length, checks, result: failures.length ? "FAIL" : "PASS" };
const filename = process.env.PILOT_UAT_FILENAME ?? "docs/UAT_ACTIVE_ROUTE_HONESTY_ONLINE_2026-10-20.json";
const outputPath = path.isAbsolute(filename) ? filename : path.join(root, filename);
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`WROTE ${outputPath}`);
if (failures.length) process.exitCode = 1;
