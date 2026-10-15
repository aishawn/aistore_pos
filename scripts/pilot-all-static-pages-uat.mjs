import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = process.env.PILOT_BASE_URL ?? "https://app.orithos.com.au";
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
const adminSubdomain = process.env.PILOT_SUBDOMAIN ?? env.PILOT_SUBDOMAIN ?? "default";
if (!adminPassword) throw new Error("MISSING_ADMIN_PASSWORD");

const appRoot = path.join(root, "pos-ui", "app");
function collect(dir, relative = "") {
  const routes = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) routes.push(...collect(full, next));
    else if (entry.name === "page.tsx" && !relative.split(path.sep).some((segment) => segment.startsWith("["))) {
      const route = `/${relative.replaceAll(path.sep, "/")}`.replace(/\/page\.tsx$/, "").replace(/\/+/g, "/") || "/";
      routes.push(route === "/" ? "/" : route.replace(/\/$/, ""));
    }
  }
  return routes;
}

const routes = [...new Set(collect(appRoot))].sort();
const viewports = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: viewports[0] });
const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password: adminPassword, subdomain: adminSubdomain },
  headers: { Origin: base },
});
const loginBody = await login.json().catch(() => ({}));
if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

const checks = [];
for (const viewport of viewports) {
  const page = await context.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of routes) {
    errors.length = 0;
    let response;
    try {
      response = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      const status = response?.status() ?? 0;
      checks.push({ route, viewport: viewport.width, status, overflow, pageErrors: [...errors] });
      console.log(`${status >= 200 && status < 400 && !overflow && errors.length === 0 ? "PASS" : "FAIL"} ${viewport.width} ${route} ${status}${overflow ? " OVERFLOW" : ""}${errors.length ? ` ERRORS=${errors.length}` : ""}`);
    } catch (error) {
      checks.push({ route, viewport: viewport.width, status: response?.status() ?? 0, overflow: null, pageErrors: [error instanceof Error ? error.message : String(error)] });
      console.log(`FAIL ${viewport.width} ${route} ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await page.close();
}
await browser.close();

const failures = checks.filter((check) => check.status < 200 || check.status >= 400 || check.overflow || check.pageErrors.length);
const output = {
  generatedAt: new Date().toISOString(),
  target: base,
  sourceCommit: process.env.GIT_COMMIT ?? null,
  staticRoutes: routes.length,
  viewports: viewports.map((viewport) => viewport.width),
  checksPassed: checks.length - failures.length,
  checksTotal: checks.length,
  failures,
  result: failures.length ? "FAIL" : "PASS",
};
const outputPath = path.join(root, "docs", "UAT_ALL_STATIC_PAGES_2026-10-15.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`WROTE ${outputPath}`);
if (failures.length) process.exitCode = 1;
