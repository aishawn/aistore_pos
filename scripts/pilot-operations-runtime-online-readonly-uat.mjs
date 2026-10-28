/** Observe served search/retry behavior; only browser-local read faults, no business mutations. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");
const base = process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au";
const expectedRuntimeSha = process.env.PILOT_EXPECTED_RUNTIME_SHA ?? process.env.PILOT_DEPLOYMENT_SHA ?? "";
if (!/^[\da-f]{40}$/i.test(expectedRuntimeSha)) throw new Error("EXPECTED_RUNTIME_SHA_REQUIRED");
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_OPERATIONS_RUNTIME_ONLINE_CURRENT.json");
const screenshotDir = path.resolve(root, process.env.PILOT_UAT_SCREENSHOT_DIR ?? "docs/screenshots/operations-runtime-online");
fs.mkdirSync(screenshotDir, { recursive: true });
const checks = [], blockedWrites = [], sessionRenewals = [], fixtureReads = [], readOnlyDatasetRequests = [];
let runtime = {};
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const login = await context.request.post(`${base}/api/auth/login`, { data: { username: "admin", password }, headers: { Origin: base }, timeout: 60000 });
  const body = await login.json().catch(() => ({}));
  if (!login.ok() || body.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  const versionResponse = await context.request.get(`${base}/api/public/version`, { timeout: 20000 });
  const version = await versionResponse.json().catch(() => ({}));
  runtime = { frontendCommit: version?.frontend?.commit ?? null, backendCommit: version?.backend?.commit ?? null };
  if (!versionResponse.ok() || runtime.frontendCommit !== expectedRuntimeSha || runtime.backendCommit !== expectedRuntimeSha) throw new Error("RUNTIME_SHA_MISMATCH");
  // This run isolates page behavior after Odoo session recovery; cold-entry failures remain separate evidence.
  const sessionResponse = await context.request.get(`${base}/api/odoo/session`, { headers: { Origin: base }, timeout: 60000 });
  const sessionBody = await sessionResponse.json().catch(() => ({}));
  checks.push({ name: "Odoo session warmup", status: sessionResponse.ok() && Boolean(sessionBody.user) ? "PASS" : "FAIL", httpStatus: sessionResponse.status() });
  if (!sessionResponse.ok() || !sessionBody.user) throw new Error("ODOO_SESSION_WARMUP_FAILED");
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.origin === new URL(base).origin && url.pathname === "/api/sell/parked") {
      fixtureReads.push({ path: url.pathname, reason: "Avoid the legacy GET endpoint that may expire parked sales." });
      return route.fulfill({ status: 200, json: { code: 0, data: [] } });
    }
    if (request.method() === "POST" && url.origin === new URL(base).origin && url.pathname === "/api/auth/refresh") {
      sessionRenewals.push({ path: url.pathname });
      return route.continue();
    }
    if (request.method() === "POST" && url.origin === new URL(base).origin && url.pathname === "/api/odoo/records") {
      const body = request.postDataJSON();
      if (["products", "posCategories"].includes(body?.type)
        && Object.keys(body).every((key) => ["type", "groupId", "pricelistId", "query", "limit", "offset", "categoryId", "stockOnly", "catalogueView", "status", "period"].includes(key))) {
        readOnlyDatasetRequests.push({ type: body.type, keys: Object.keys(body).filter((key) => key !== "type") });
        return route.continue();
      }
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      let requestType = null;
      try {
        const body = request.postDataJSON()?.type;
        if (typeof body === "string") requestType = body;
      } catch { /* Preserve the read-only block for non-JSON mutation requests. */ }
      blockedWrites.push({ method: request.method(), path: url.pathname, requestType });
      return route.fulfill({ status: 405, json: { code: 40500, message: "Read-only UAT blocks this request" } });
    }
    return route.continue();
  });
  for (const width of [390, 1440]) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    const actualViewport = await page.evaluate(() => innerWidth);
    if (actualViewport !== width) throw new Error(`VIEWPORT_MISMATCH_${actualViewport}_${width}`);
    const errors = [];
    const apiFailures = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => { if (response.status() >= 400 && new URL(response.url()).pathname.startsWith("/api/")) apiFailures.push({ path: new URL(response.url()).pathname, status: response.status() }); });
    const record = (name, ok, evidence = null) => checks.push({ viewport: width, actualViewport, name, status: ok ? "PASS" : "FAIL", evidence });
    try {
      await page.goto(`${base}/stock/stocktake`, { waitUntil: "networkidle", timeout: 60000 });
      const search = page.getByRole("combobox", { name: "Search or scan a product", exact: true });
      await search.fill("wine");
      const list = page.getByRole("listbox", { name: "Stocktake product results", exact: true });
      await list.waitFor({ timeout: 30000 });
      await search.fill("orithos_uat_no_match_716492");
      record("new search retires old results during debounce", await list.count() === 0);
      record("pending search reports busy and collapsed", await search.getAttribute("aria-busy") === "true" && await search.getAttribute("aria-expanded") === "false");
      await list.waitFor({ timeout: 30000 });
      record("current empty search completes", await list.getByText("No matching products.", { exact: true }).isVisible());
      await page.screenshot({ path: path.join(screenshotDir, `stocktake-${width}.png`), fullPage: true });
      let failPlanOnce = true;
      let replenishmentAttempts = 0;
      await page.route("**/api/odoo/replenishment?**", async (route) => {
        replenishmentAttempts += 1;
        if (failPlanOnce) {
          failPlanOnce = false;
          return route.fulfill({ status: 503, json: { message: "Read-only browser fault: plan unavailable" } });
        }
        return route.continue();
      });
      await page.goto(`${base}/stock/replenishment`, { waitUntil: "networkidle", timeout: 60000 });
      await page.getByRole("heading", { name: "Purchasing", exact: true }).waitFor({ timeout: 60000 });
      await page.getByRole("link", { name: "Replenishment", exact: true }).waitFor({ state: "visible" });
      const summary = page.getByRole("region", { name: "Replenishment summary", exact: true });
      const recommendations = page.getByRole("heading", { name: "Replenishment suggestions", exact: true });
      await summary.waitFor({ state: "visible", timeout: 60000 });
      await recommendations.waitFor({ state: "visible", timeout: 60000 });
      await page.getByRole("status").filter({ hasText: "Updating replenishment" }).waitFor({ state: "hidden", timeout: 60000 });
      const automaticallyRecovered = replenishmentAttempts >= 2 && await summary.isVisible() && await recommendations.isVisible();
      record("transient 503 automatically retries and recovers real Odoo replenishment", automaticallyRecovered, { replenishmentAttempts });
      record("automatic retry leaves no replenishment error state", await page.getByRole("heading", { name: "Could not load replenishment", exact: true }).count() === 0);
      record("no page errors or viewport overflow", errors.length === 0 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), errors);
      await page.screenshot({ path: path.join(screenshotDir, `replenishment-${width}.png`), fullPage: true });
    } catch (error) {
      record("run", false, { error: error instanceof Error ? error.message : "Unexpected failure", path: new URL(page.url()).pathname, headings: await page.locator("h1").allTextContents(), apiFailures });
      await page.screenshot({ path: path.join(screenshotDir, `failure-${width}.png`), fullPage: true }).catch(() => null);
    }
    finally { await page.close(); }
  }
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await context.close();
} catch (error) { checks.push({ name: "run", status: "FAIL", evidence: error instanceof Error ? error.message : "Unexpected failure" }); }
finally { await browser.close(); }
const failed = checks.filter((check) => check.status === "FAIL").length;
const output = { generatedAt: new Date().toISOString(), sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), expectedRuntimeSha: expectedRuntimeSha.toLowerCase(), runtime, deployment: runtime.frontendCommit === runtime.backendCommit ? runtime.frontendCommit : "unverified-after-push", target: base, scope: "Real authenticated stocktake/replenishment reads and browser-local GET fault injection; the legacy parked-sales GET is replaced by an empty fixture to avoid its possible cleanup side effect; server-allowlisted product/category reads are permitted; same-origin auth session renewal permitted; business API mutations blocked; no inventory/RFQ/order writes", status: failed === 0 && !blockedWrites.length ? "PASS" : "FAIL", checks, blockedWrites, sessionRenewals, fixtureReads, readOnlyDatasetRequests };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, failed, blockedWrites: blockedWrites.length }));
if (output.status !== "PASS") process.exitCode = 1;
