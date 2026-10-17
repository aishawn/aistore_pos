import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const routes = [
  { host: "https://demo.orithos.com.au", path: "/purchases/odoo", heading: "Purchases" },
  { host: "https://demo.orithos.com.au", path: "/utilities/mail-log", heading: "Mail Log" },
  { host: "https://demo.orithos.com.au", path: "/utilities/trashed-items", heading: "Trashed Items" },
  { host: "https://app.orithos.com.au", path: "/platform/stores", heading: "Stores" },
];
const viewports = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const outputDir = path.join(root, "docs", "screenshots", "2026-10-17-admin-list-batch");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
for (const viewport of viewports) {
  const context = await browser.newContext({ viewport });
  const loggedIn = new Set();
  for (const route of routes) {
    if (!loggedIn.has(route.host)) {
      const login = await context.request.post(`${route.host}/api/auth/login`, { data: { username: "admin", password }, headers: { Origin: route.host } });
      const body = await login.json().catch(() => ({}));
      if (!login.ok() || body.code !== 0) throw new Error(`LOGIN_FAILED_${route.host}_${login.status()}`);
      loggedIn.add(route.host);
    }
    const page = await context.newPage();
    const response = await page.goto(`${route.host}${route.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1800);
    const checks = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      pageErrors: [],
    }));
    const slug = route.path.slice(1).replaceAll("/", "-");
    const screenshot = `docs/screenshots/2026-10-17-admin-list-batch/${slug}-${viewport.width}.png`;
    await page.screenshot({ path: path.join(root, screenshot), fullPage: true });
    results.push({
      host: route.host,
      route: route.path,
      viewport: viewport.width,
      status: response?.status() ?? 0,
      heading: (await page.locator("h1").first().textContent().catch(() => ""))?.trim() || null,
      expectedHeading: route.heading,
      noHorizontalOverflow: checks.scrollWidth <= checks.viewportWidth,
      screenshot,
    });
    await page.close();
  }
  await context.close();
}
await browser.close();

const failures = results.filter((result) => result.status !== 200 || result.heading !== result.expectedHeading || !result.noHorizontalOverflow);
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: process.env.PILOT_SOURCE_COMMIT ?? null,
  deployment: process.env.PILOT_DEPLOYMENT_SHA ?? null,
  scope: "authenticated read-only admin list visual regression; no business writes",
  routes: routes.map(({ host, path: route }) => `${host}${route}`),
  viewports: viewports.map(({ width }) => width),
  checks: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  failures,
  results,
};
const outputPath = path.join(root, "docs", "UAT_ADMIN_LIST_BATCH_2026-10-17.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, checks: results.length, passed: output.passed, failed: output.failed }));
if (failures.length) process.exitCode = 1;
