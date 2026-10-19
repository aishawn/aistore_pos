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
const subdomain = process.env.PILOT_SUBDOMAIN ?? env.PILOT_SUBDOMAIN ?? "demo";
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
const localMockMode = process.env.PILOT_LOCAL_MOCKS === "true";
if (!localMockMode && !password) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const checks = [];
const writes = [];
let outletRequests = 0;
const outletStatuses = [];
let releaseOutletRetry;
const outletRetryGate = new Promise((resolve) => { releaseOutletRetry = resolve; });
let releaseRaceA;
const raceAGate = new Promise((resolve) => { releaseRaceA = resolve; });
let completeRaceA;
const raceACompleted = new Promise((resolve) => { completeRaceA = resolve; });
let raceARequests = 0;
let raceBRequests = 0;

const giftCard = (code) => ({ id: `uat-${code.toLowerCase()}`, clientId: "uat", outletId: "uat", code, originalAmount: 10, currentAmount: 10, expiry: "", status: "Active" });

try {
  if (localMockMode) {
    await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
    await context.addInitScript(() => {
      localStorage.setItem("sf_token", "local-uat-session");
      localStorage.setItem("sf_user", JSON.stringify({ id: "uat-admin", name: "UAT Admin", username: "admin", isAdmin: true }));
    });
  } else {
    const login = await context.request.post(`${base}/api/auth/login`, {
      data: { username: "admin", password, subdomain },
      headers: { Origin: base, "X-Orithos-Tenant-Slug": subdomain },
    });
    const loginBody = await login.json().catch(() => ({}));
    if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
    const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
    if (!accessCookie || !loginBody.data?.user) throw new Error("LOGIN_SESSION_NOT_AVAILABLE_TO_BROWSER");
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem("sf_token", token);
      localStorage.setItem("sf_user", JSON.stringify(user));
    }, { token: accessCookie.value, user: loginBody.data.user });
  }

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/outlets") outletStatuses.push(response.status());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(`${request.method()} ${url.pathname}`);
  });
  if (localMockMode) {
    await page.route("**/api/**", async (route) => {
      if (route.request().method() !== "GET") {
        return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "Local UAT blocks API writes", data: null }) });
      }
      const url = new URL(route.request().url());
      const data = url.pathname === "/api/gift-cards"
        ? { items: [], total: 0, page: 1, size: 25 }
        : [];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data }) });
    });
  }
  await page.route("**/api/outlets", async (route) => {
    if (route.request().method() !== "GET") return localMockMode ? route.fallback() : route.continue();
    outletRequests += 1;
    if (outletRequests === 1) {
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Injected outlet lookup failure" }) });
    }
    await outletRetryGate;
    if (localMockMode) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: [] }) });
    return route.continue();
  });
  await page.route("**/api/gift-cards**", async (route) => {
    if (route.request().method() !== "GET") return localMockMode ? route.fallback() : route.continue();
    const code = new URL(route.request().url()).searchParams.get("code");
    if (code === "RACE-A") {
      raceARequests += 1;
      await raceAGate;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data: { items: [giftCard("RACE-A")], total: 1 } }) });
      completeRaceA();
      return;
    }
    if (code === "RACE-B") {
      raceBRequests += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data: { items: [giftCard("RACE-B")], total: 1 } }) });
      return;
    }
    return localMockMode ? route.fallback() : route.continue();
  });

  await page.goto(`${base}/giftcards?__uat_probe=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const notice = page.getByRole("alert").filter({ hasText: "Outlets:" });
  await notice.waitFor({ timeout: 30000 });
  const retryResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/outlets" && response.status() === 200,
  { timeout: 30000 });
  const retryRequestPending = page.waitForRequest((request) =>
    new URL(request.url()).pathname === "/api/outlets" && request.method() === "GET",
    { timeout: 15000 },
  );
  await notice.getByRole("button", { name: "Retry" }).click();
  await retryRequestPending;
  const retryingButton = notice.getByRole("button", { name: "Retrying…" });
  let retryDisabledWhileLoading = false;
  try {
    await retryingButton.waitFor({ timeout: 1500 });
    retryDisabledWhileLoading = await retryingButton.isDisabled();
  } catch {
    // Preserve failure evidence if the deployed UI loses the dependency notice during Retry.
  }
  const retryState = await page.evaluate(() => ({
    alerts: [...document.querySelectorAll('[role="alert"]')].map((element) => ({ text: element.textContent?.trim() ?? "", busy: element.getAttribute("aria-busy") === "true" })),
    retryButtons: [...document.querySelectorAll('button')].filter((button) => /retry/i.test(button.textContent ?? "")).map((button) => ({ text: button.textContent?.trim(), disabled: button.disabled })),
  }));
  const retryAlertBusy = retryState.alerts.some((alert) => alert.text.includes("Outlets:") && alert.busy);
  const outletFilterDisabledWhileLoading = await page.getByRole("combobox", { name: "Filter by outlet" }).isDisabled();
  releaseOutletRetry();
  await retryResponse;
  await notice.waitFor({ state: "detached", timeout: 30000 });

  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  checks.push({
    name: "Gift card outlet Retry remains visible and locks repeated actions",
    status: outletRequests >= 2 && retryDisabledWhileLoading && retryAlertBusy && outletFilterDisabledWhileLoading && dimensions.document <= dimensions.viewport && pageErrors.length === 0 ? "PASS" : "FAIL",
    evidence: { outletRequests, outletStatuses, retryRequestPending: true, retryDisabledWhileLoading, retryAlertBusy, retryState, outletFilterDisabledWhileLoading, viewport: dimensions, pageErrors },
  });

  const search = page.getByRole("textbox", { name: "Search gift card codes" });
  const raceARequest = page.waitForRequest((request) => new URL(request.url()).searchParams.get("code") === "RACE-A", { timeout: 15000 });
  await search.fill("RACE-A");
  await raceARequest;
  const raceBRequest = page.waitForRequest((request) => new URL(request.url()).searchParams.get("code") === "RACE-B", { timeout: 15000 });
  await search.fill("RACE-B");
  await raceBRequest;
  const latestSearchText = page.getByText("RACE-B", { exact: true });
  await latestSearchText.last().waitFor({ timeout: 15000 });
  const raceAResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.searchParams.get("code") === "RACE-A" && response.status() === 200;
  }, { timeout: 15000 }).then(() => true).catch(() => false);
  releaseRaceA();
  await raceACompleted;
  const raceAResponseReceived = await raceAResponse;
  await page.waitForTimeout(500);
  const isTextVisible = async (text) => page.getByText(text, { exact: true }).evaluateAll((elements) =>
    elements.some((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden"));
  const latestSearchRemainsVisible = await isTextVisible("RACE-B");
  const staleSearchIsHidden = !(await isTextVisible("RACE-A"));
  checks.push({
    name: "Gift card search ignores a stale response after newer filters load",
    status: raceARequests === 1 && raceBRequests === 1 && latestSearchRemainsVisible && staleSearchIsHidden ? "PASS" : "FAIL",
    evidence: { raceARequests, raceBRequests, raceAResponseReceived, latestSearchRemainsVisible, staleSearchIsHidden },
  });
} finally {
  releaseOutletRetry();
  releaseRaceA();
  if (!localMockMode) {
    try { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); } catch { /* Session expires normally. */ }
  }
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  environment: localMockMode ? "local-dev-fixtures" : "live-read-only-injected",
  deployment: localMockMode
    ? "not-applicable-local-dev"
    : process.env.PILOT_DEPLOYMENT_VERIFIED === "true" && /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
    ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase()
    : "unverified-after-deploy",
  target: base,
  scope: "read-only gift card outlet lookup failure injection; one GET returns 503; Retry progress and outlet filter lock are verified; no business writes",
  checks,
  writes,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_GIFTCARDS_OUTLET_RETRY_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, checks, writes }));
if (checks.some((check) => check.status !== "PASS") || writes.length) process.exitCode = 2;
