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
const expectedRuntimeSha = process.env.PILOT_EXPECTED_RUNTIME_SHA;
if (!adminPassword) throw new Error("MISSING_ADMIN_PASSWORD");
if (!/^[\da-f]{40}$/i.test(expectedRuntimeSha ?? "")) throw new Error("EXPECTED_RUNTIME_SHA_REQUIRED");

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

const allRoutes = [...new Set(collect(appRoot))].sort();
const requestedRoutes = process.env.PILOT_UAT_ROUTES?.split(",").map((route) => route.trim()).filter(Boolean);
if (requestedRoutes?.some((route) => !allRoutes.includes(route))) throw new Error("UNKNOWN_PILOT_UAT_ROUTE");
const routes = requestedRoutes?.length ? requestedRoutes : allRoutes;
const requestedWidths = process.env.PILOT_UAT_VIEWPORTS?.split(",").map(Number);
if (requestedWidths?.some((width) => !Number.isInteger(width) || width < 320 || width > 2560)) throw new Error("INVALID_PILOT_UAT_VIEWPORT");
const viewports = (requestedWidths?.length ? requestedWidths : [390, 1440]).map((width) => ({ width, height: width <= 500 ? 844 : 900 }));
// The Demo host is a tenant host. Platform operations is intentionally
// restricted to the control-plane host and must be verified there separately.
const tenantExpectedUnavailable = new Set(["/platform/operations"]);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: viewports[0] });
const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password: adminPassword, subdomain: adminSubdomain },
  headers: { Origin: base, "X-Orithos-Tenant-Slug": adminSubdomain },
});
const loginBody = await login.json().catch(() => ({}));
if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
const versionBeforeResponse = await context.request.get(`${base}/api/public/version`, { timeout: 20000 });
const versionBefore = await versionBeforeResponse.json().catch(() => ({}));
const runtimeBefore = {
  frontendCommit: versionBefore?.frontend?.commit ?? null,
  backendCommit: versionBefore?.backend?.commit ?? null,
};
if (!versionBeforeResponse.ok() || runtimeBefore.frontendCommit !== expectedRuntimeSha || runtimeBefore.backendCommit !== expectedRuntimeSha) {
  await browser.close();
  throw new Error("RUNTIME_SHA_MISMATCH_BEFORE_UAT");
}

const checks = [];
const blockedApiRequests = [];
const navigationRetries = [];
const fixtureReads = [];
const readOnlyRecordPosts = [];
const sessionRenewals = [];
const recordTypes = new Set(["products", "purchaseProducts", "posCategories", "customers", "suppliers", "outlets", "registers", "sessions", "paymentMethods", "taxes", "sales"]);
const recordKeys = new Set(["type", "groupId", "pricelistId", "query", "limit", "offset", "categoryId", "stockOnly", "catalogueView", "status", "period"]);
await context.route("**/api/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (request.method() === "GET" && url.origin === new URL(base).origin && url.pathname === "/api/sell/parked") {
    fixtureReads.push({ path: url.pathname, reason: "Avoid the legacy GET endpoint that may expire parked sales." });
    return route.fulfill({ status: 200, json: { code: 0, data: [] } });
  }
  if (request.method() === "POST" && url.origin === new URL(base).origin && url.pathname === "/api/auth/refresh") {
    sessionRenewals.push(url.pathname);
    return route.continue();
  }
  if (request.method() === "POST" && url.origin === new URL(base).origin && url.pathname === "/api/odoo/records") {
    try {
      const body = request.postDataJSON();
      if (recordTypes.has(body?.type) && Object.keys(body).every((key) => recordKeys.has(key))) {
        readOnlyRecordPosts.push({ type: body.type, keys: Object.keys(body).filter((key) => key !== "type") });
        return route.continue();
      }
    } catch { /* Unknown request shapes remain blocked. */ }
  }
  if (request.method() === "POST" && url.origin === new URL(base).origin && url.pathname === "/api/reports") {
    try {
      const body = request.postDataJSON();
      const keys = Object.keys(body ?? {});
      const cacheKeys = Object.keys(body?.cache ?? {});
      if (typeof body?.query === "string"
        && keys.every((key) => ["query", "cache"].includes(key))
        && cacheKeys.every((key) => key === "id")
        && (body?.cache === undefined || typeof body.cache?.id === "string")) {
        readOnlyRecordPosts.push({ type: "reportQuery", keys });
        return route.continue();
      }
    } catch { /* Saved-report mutations and unknown payloads remain blocked. */ }
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
    blockedApiRequests.push({ method: request.method(), path: url.pathname });
    return route.fulfill({ status: 405, json: { code: 40500, message: "Read-only route UAT blocked this request" } });
  }
  return route.continue();
});
async function gotoWithNetworkRetry(page, url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      if (response && response.status() >= 500 && attempt < 3) {
        navigationRetries.push({ route: new URL(url).pathname, attempt, status: response.status() });
        await page.waitForTimeout(750 * attempt);
        continue;
      }
      return response;
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
      const expectedUnavailable = tenantExpectedUnavailable.has(route) && status === 404;
      checks.push({ route, viewport: viewport.width, status, overflow, pageErrors: [...errors], expectedUnavailable });
      console.log(`${(status === 200 && !overflow && errors.length === 0) || expectedUnavailable ? "PASS" : "FAIL"} ${viewport.width} ${route} ${status}${expectedUnavailable ? " EXPECTED_TENANT_404" : ""}${overflow ? " OVERFLOW" : ""}${errors.length ? ` ERRORS=${errors.length}` : ""}`);
    } catch (error) {
      checks.push({ route, viewport: viewport.width, status: response?.status() ?? 0, overflow: null, pageErrors: [error instanceof Error ? error.message : String(error)] });
      console.log(`FAIL ${viewport.width} ${route} ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await page.close();
}
const versionAfterResponse = await context.request.get(`${base}/api/public/version`, { timeout: 20000 });
const versionAfter = await versionAfterResponse.json().catch(() => ({}));
const runtimeAfter = {
  frontendCommit: versionAfter?.frontend?.commit ?? null,
  backendCommit: versionAfter?.backend?.commit ?? null,
};
if (!versionAfterResponse.ok() || runtimeAfter.frontendCommit !== expectedRuntimeSha || runtimeAfter.backendCommit !== expectedRuntimeSha) {
  checks.push({ route: "runtime-sha-stability", viewport: "all", status: 409, overflow: false, pageErrors: ["Runtime SHA changed or mismatched during UAT"] });
}
await browser.close();

const failures = checks.filter((check) => !check.expectedUnavailable && (check.status !== 200 || check.overflow || check.pageErrors.length));
const expectedUnavailable = checks.filter((check) => check.expectedUnavailable);
const output = {
  generatedAt: new Date().toISOString(),
  target: base,
  sourceCommit: process.env.PILOT_SOURCE_COMMIT ?? process.env.GIT_COMMIT
    ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  deployment: /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
    ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase()
    : "unverified-after-deploy",
  expectedRuntimeSha: expectedRuntimeSha.toLowerCase(),
  runtimeBefore,
  runtimeAfter,
  staticRoutes: routes.length,
  viewports: viewports.map((viewport) => viewport.width),
  routeFilter: requestedRoutes ?? null,
  checksPassed: checks.length - failures.length,
  checksTotal: checks.length,
  expectedUnavailable,
  failures,
  navigationRetries,
  blockedApiRequests,
  fixtureReads,
  readOnlyRecordPosts,
  sessionRenewals,
  scope: "Live authenticated static route/layout checks; parked-sales GET replaced with an empty fixture; allowlisted Odoo records and query-only POST /api/reports (string query plus optional cache.id) and auth refresh permitted; saved-report mutations and other API mutations blocked",
  result: failures.length ? "FAIL" : blockedApiRequests.length ? "BLOCKED" : "PASS",
};
const requestedOutput = process.env.PILOT_UAT_FILENAME || "UAT_ALL_STATIC_PAGES_2026-10-15.json";
const outputPath = path.isAbsolute(requestedOutput)
  ? requestedOutput
  : path.join(root, requestedOutput.startsWith(`docs${path.sep}`) || requestedOutput.startsWith("docs/")
    ? requestedOutput
    : path.join("docs", requestedOutput));
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`WROTE ${outputPath}`);
if (failures.length || blockedApiRequests.length) process.exitCode = 1;
