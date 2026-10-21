import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://app.localhost:3035";
const browser = await chromium.launch({ headless: true });
const results = [];
const blockedWrites = [];
const identity = { id: 1, name: "Platform Admin", username: "admin", isAdmin: true, platformOperator: true };
const health = { checkedAt: "2026-10-21T10:00:00Z", environment: "uat", backend: { service: "pos-api", commit: null, builtAt: null }, dependencies: [{ name: "database", status: "UP", durationMs: 4, note: "Connection probe succeeded." }] };
const usage = { windowHours: 24, since: "2026-10-20T10:00:00Z", generatedAt: "2026-10-21T10:00:00Z", summary: { storesWithActivity: 1, requests: 4, allowed: 3, rejected: 1, allowedRate: 75, averageLatencyMs: 80, p95LatencyMs: 120, estimatedTokens: 200 }, byStore: [{ vendorId: 2, storeName: "Demo Store", subdomain: "demo", status: "active", requests: 4, allowedRate: 75, averageLatencyMs: 80, p95LatencyMs: 120, lastSeenAt: "2026-10-21T09:59:00Z" }] };

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  for (const routeName of ["operations", "usage"]) {
    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
    const page = await context.newPage();
    const pageErrors = [];
    const requests = [];
    let attempts = 0;
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/")) {
        requests.push(`${request.method()} ${url.pathname}`);
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) blockedWrites.push(`${request.method()} ${url.pathname}`);
      }
    });
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() !== "GET") {
        if (url.pathname === "/api/auth/me") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: identity }) });
        return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "Fixture blocks writes", data: null }) });
      }
      if (url.pathname === "/api/auth/me") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: identity }) });
      if (url.pathname === "/api/public/version") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data: { frontend: { service: "orithos-frontend", commit: null, builtAt: null } } }) });
      const target = routeName === "operations" ? "/api/admin/operations/health" : "/api/platform/metrics/ai";
      if (url.pathname === target) {
        attempts += 1;
        if (attempts <= 2) return route.fulfill({ status: 200, headers: { "x-correlation-id": "fixture-error" }, contentType: "application/json", body: JSON.stringify({ code: 50300, message: "Fixture temporarily unavailable", data: null }) });
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: routeName === "operations" ? health : usage }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: [] }) });
    });
    await page.goto(`${base}/platform/${routeName}?__uat=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: routeName === "operations" ? "Operations" : "AI usage" }).waitFor({ state: "visible", timeout: 30000 });
    await page.getByRole("button", { name: "Retry", exact: true }).waitFor({ state: "visible", timeout: 30000 });
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.waitForFunction((text) => document.body.innerText.includes(text), routeName === "operations" ? "MySQL" : "Demo Store", { timeout: 30000 });
    if (routeName === "usage") {
      await page.locator("#platform-ai-window").selectOption("168");
      await page.waitForTimeout(150);
    }
    const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
    results.push({ route: `/platform/${routeName}`, viewport: viewport.width, attempts, retryRecovered: true, pageErrors, ...metrics, overflow: metrics.scrollWidth > metrics.viewportWidth });
    await context.close();
  }
}
await browser.close();
const evidence = { generatedAt: new Date().toISOString(), target: base, scope: "local browser fixture; platform APIs intercepted; no writes", status: results.every((item) => item.retryRecovered && item.pageErrors.length === 0 && !item.overflow) && blockedWrites.length === 0 ? "PASS" : "FAIL", checks: results, blockedWrites };
const output = path.join(root, "docs", "UAT_PLATFORM_OPERATIONS_USAGE_LOCAL_2026-10-24.json");
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
