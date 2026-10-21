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
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
const adminSubdomain = process.env.PILOT_SUBDOMAIN ?? env.PILOT_SUBDOMAIN ?? "demo";
if (!adminPassword) throw new Error("MISSING_ADMIN_PASSWORD");

// Next.js uses the root app directory when both route trees exist. Keep the
// matrix aligned with the production route tree instead of validating the
// legacy duplicate under src/app.
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
  headers: { Origin: base, "X-Orithos-Tenant-Slug": adminSubdomain },
});
const loginBody = await login.json().catch(() => ({}));
if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

const checks = [];
async function gotoWithNetworkRetry(page, url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/ERR_(?:CONNECTION|NETWORK)|interrupted by another navigation|chrome-error/i.test(message) || attempt === 3) throw error;
      await page.waitForTimeout(750 * attempt);
    }
  }
  throw lastError;
}
for (const viewport of viewports) {
  const page = await context.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of routes) {
    errors.length = 0;
    let response;
    try {
      response = await gotoWithNetworkRetry(page, `${base}${route}`);
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      const status = response?.status() ?? 0;
      checks.push({ route, viewport: viewport.width, status, overflow, pageErrors: [...errors] });
      console.log(`${status === 200 && !overflow && errors.length === 0 ? "PASS" : "FAIL"} ${viewport.width} ${route} ${status}${overflow ? " OVERFLOW" : ""}${errors.length ? ` ERRORS=${errors.length}` : ""}`);
    } catch (error) {
      checks.push({ route, viewport: viewport.width, status: response?.status() ?? 0, overflow: null, pageErrors: [error instanceof Error ? error.message : String(error)] });
      console.log(`FAIL ${viewport.width} ${route} ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await page.close();
}
await browser.close();

const failures = checks.filter((check) => check.status !== 200 || check.overflow || check.pageErrors.length);
const output = {
  generatedAt: new Date().toISOString(),
  target: base,
  sourceCommit: process.env.PILOT_SOURCE_COMMIT ?? process.env.GIT_COMMIT
    ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  deployment: /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
    ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase()
    : "unverified-after-deploy",
  staticRoutes: routes.length,
  viewports: viewports.map((viewport) => viewport.width),
  checksPassed: checks.length - failures.length,
  checksTotal: checks.length,
  failures,
  result: failures.length ? "FAIL" : "PASS",
};
const requestedOutput = process.env.PILOT_UAT_FILENAME || "UAT_ALL_STATIC_PAGES_2026-10-15.json";
const outputPath = path.isAbsolute(requestedOutput)
  ? requestedOutput
  : path.join(root, requestedOutput.startsWith(`docs${path.sep}`) || requestedOutput.startsWith("docs/")
    ? requestedOutput
    : path.join("docs", requestedOutput));
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`WROTE ${outputPath}`);
if (failures.length) process.exitCode = 1;
