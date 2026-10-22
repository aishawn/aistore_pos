import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://app.localhost:3035";
const browser = await chromium.launch({ headless: true });
const results = [];
const blockedWrites = [];

const auditFixture = {
  items: [{
    id: 1, eventId: "evt-1", correlationId: "req-1", tenantId: 2, tenantName: "Demo Store",
    tenantSlug: "demo", actorId: 1, actorUsername: "admin", action: "OWNER_REINVITED",
    targetType: "owner", targetId: "1", reason: "Fixture operation", outcome: "SUCCEEDED",
    beforeSummary: null, afterSummary: "{\"sent\":true}", errorCode: null, errorType: null,
    createdAt: "2026-10-21T10:00:00Z", completedAt: "2026-10-21T10:00:01Z",
  }], total: 1, page: 1, size: 50,
};
const failureFixture = {
  items: [{
    fingerprint: "f-1", environment: "uat", service: "orithos-backend", tenantId: 2,
    tenantName: "Demo Store", tenantSlug: "demo", httpMethod: "GET", requestPath: "/api/odoo/products",
    httpStatus: 502, errorCode: 50210, errorType: "UpstreamUnavailable", errorSummary: "[REDACTED]",
    occurrences: 2, latestDurationMs: 120, firstSeenAt: "2026-10-21T10:00:00Z",
    lastSeenAt: "2026-10-21T10:01:00Z", latestCorrelationId: "req-2", runtimeCommit: null,
  }], total: 1, page: 1, size: 50,
};

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  for (const routeName of ["audit", "failures"]) {
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
        if (url.pathname === "/api/auth/me") {
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: { id: 1, name: "Platform Admin", username: "admin", isAdmin: true, platformOperator: true } }) });
        }
        return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "Fixture blocks writes", data: null }) });
      }
      if (url.pathname === "/api/auth/me") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: { id: 1, name: "Platform Admin", username: "admin", isAdmin: true, platformOperator: true } }) });
      }
      if (url.pathname === `/api/admin/${routeName}/events`) {
        attempts += 1;
        if (attempts <= 2) return route.fulfill({ status: 200, headers: { "x-correlation-id": "fixture-error" }, contentType: "application/json", body: JSON.stringify({ code: 50300, message: "Fixture temporarily unavailable", data: null }) });
        const data = routeName === "audit" ? auditFixture : failureFixture;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data }) });
      }
      if (routeName === "failures" && url.pathname === "/api/admin/alerts") {
        return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: 40400, message: "Alerts endpoint unavailable in this runtime", data: null }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: [] }) });
    });
    await page.goto(`${base}/platform/${routeName}?__uat=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const title = routeName === "audit" ? "Platform audit" : "Platform failures";
    await page.getByRole("heading", { name: title }).waitFor({ state: "visible", timeout: 30000 });
    const retry = page.getByRole("button", { name: "Retry", exact: true });
    await retry.waitFor({ state: "visible", timeout: 5000 }).catch(async () => {
      console.error(JSON.stringify({ routeName, attempts, requests, body: await page.locator("body").innerText() }));
      throw new Error(`RETRY_NOT_VISIBLE_${routeName}`);
    });
    await retry.click();
    const expectedText = routeName === "audit" ? "Owner Reinvited" : "UpstreamUnavailable";
    await page.waitForFunction((text) => document.body.innerText.includes(text), expectedText, { timeout: 30000 });
    if (routeName === "failures") {
      await page.getByText(/Operational alerts are unavailable/).waitFor({ state: "visible", timeout: 5000 });
      for (const name of ["Search", "Clear failure filters", "Refresh", "Retry"]) {
        const button = page.getByRole("button", { name, exact: true });
        if (await button.count()) {
          const className = await button.first().getAttribute("class");
          if (!className?.includes("focus-visible:outline")) throw new Error(`MISSING_FOCUS_STYLE_${name}`);
        }
      }
    }
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    results.push({ route: `/platform/${routeName}`, viewport: viewport.width, attempts, retryRecovered: true, pageErrors, ...metrics, overflow: metrics.scrollWidth > metrics.viewportWidth });
    await context.close();
  }
}
await browser.close();
const evidence = { generatedAt: new Date().toISOString(), sourceCommit: process.env.PILOT_SOURCE_COMMIT ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), target: base, scope: "local browser fixture; platform APIs intercepted; no live business writes", status: results.every((item) => item.retryRecovered && item.pageErrors.length === 0 && !item.overflow) && blockedWrites.length === 0 ? "PASS" : "FAIL", checks: results, blockedWrites };
const output = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_PLATFORM_AUDIT_FAILURES_LOCAL_2026-10-24.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
