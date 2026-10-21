import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");
const base = "https://app.orithos.com.au";
const browser = await chromium.launch({ headless: true });
const checks = [];
for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  const context = await browser.newContext({ viewport });
  const login = await context.request.post(`${base}/api/auth/login`, { data: { username: "admin", password, subdomain: "demo" }, headers: { Origin: base, "X-Orithos-Tenant-Slug": "demo" } });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  for (const routeName of ["operations", "usage"]) {
    const page = await context.newPage();
    const pageErrors = [];
    const nonGet = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method()) && url.pathname !== "/api/auth/login") nonGet.push(`${request.method()} ${url.pathname}`);
    });
    const response = await page.goto(`${base}/platform/${routeName}?__uat=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const heading = routeName === "operations" ? "Operations" : "AI usage";
    const headingLocator = page.getByRole("heading", { name: heading, exact: true });
    await headingLocator.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    const headingVisible = await headingLocator.isVisible().catch(() => false);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
    checks.push({ route: `/platform/${routeName}`, viewport: viewport.width, status: response?.status() ?? null, finalUrl: page.url(), headingVisible, pageErrors, nonGet, noHorizontalOverflow: metrics.scrollWidth <= metrics.viewportWidth, bodyHasRetry: bodyText.includes("Retry"), bodyPreview: bodyText.slice(0, 240) });
    await page.close();
  }
  await context.close();
}
await browser.close();
let version = null;
try { version = await (await fetch("https://app.orithos.com.au/api/public/version", { cache: "no-store" })).json(); } catch { version = null; }
const output = { generatedAt: new Date().toISOString(), sourceCommit: process.env.PILOT_SOURCE_COMMIT ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), deployment: process.env.PILOT_DEPLOYMENT_SHA ?? "unverified-after-deploy", target: base, scope: "authenticated read-only control-plane UI; no business writes", status: checks.every((item) => item.status === 200 && item.headingVisible && item.pageErrors.length === 0 && item.nonGet.length === 0 && item.noHorizontalOverflow) ? "PASS" : "FAIL", checks, runtimeVersion: version };
const outputPath = path.join(root, "docs", "UAT_PLATFORM_OPERATIONS_USAGE_ONLINE_2026-10-24.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, passed: checks.filter((item) => item.status === 200 && item.headingVisible && item.pageErrors.length === 0 && item.nonGet.length === 0 && item.noHorizontalOverflow).length }, null, 2));
