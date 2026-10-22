import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
const hostname = new URL(base).hostname;
if (!["localhost", "127.0.0.1"].includes(hostname) && !hostname.endsWith(".localhost")) throw new Error("This fixture UAT is local-only.");

const browser = await chromium.launch({ headless: true });
const checks = [];

for (const scenario of [
  { name: "temporary Odoo outage", status: 503, message: "Odoo reporting is temporarily unavailable.", expectConnectionPrompt: false },
  { name: "missing Odoo session", status: 401, message: "Connect Odoo before loading live reports.", expectConnectionPrompt: true },
]) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
  const page = await context.newPage();
  const writes = [];
  const calls = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return;
    calls.push(`${request.method()} ${url.pathname}`);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(`${request.method()} ${url.pathname}`);
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: { id: 1, username: "fixture", name: "Fixture Admin", isAdmin: true } }) });
    if (url.pathname === "/api/odoo/reporting-dashboard") return route.fulfill({ status: scenario.status, headers: { "x-correlation-id": `fixture-report-${scenario.status}` }, contentType: "application/json", body: JSON.stringify({ message: scenario.message }) });
    if (url.pathname === "/api/odoo/session") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: 1, name: "Odoo Fixture", username: "admin" }, autoRecoverConfigured: false }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: null }) });
  });
  await page.goto(`${base}/reports/dashboard?__uat=reporting-error-${scenario.status}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const expectedHeading = scenario.expectConnectionPrompt ? "Connect Odoo to view live reports" : "Could not load the reporting dashboard";
  await page.getByRole("heading", { name: expectedHeading, exact: true }).waitFor({ timeout: 30000 });
  const body = await page.locator("body").innerText();
  const retryVisible = await page.getByRole("button", { name: "Retry", exact: true }).isVisible().catch(() => false);
  const connectVisible = await page.getByRole("link", { name: "Connect Odoo", exact: true }).isVisible().catch(() => false);
  const requestIdVisible = body.includes(`fixture-report-${scenario.status}`);
  const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
  checks.push({ scenario: scenario.name, status: scenario.status, expectedHeading, retryVisible, connectVisible, requestIdVisible, calls, writes, ...metrics, overflow: metrics.scrollWidth > metrics.viewportWidth });
  await context.close();
}

await browser.close();
const evidence = {
  generatedAt: new Date().toISOString(),
  sourceCommit: process.env.PILOT_SOURCE_COMMIT ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  target: base,
  scope: "local browser fixture; reporting API intercepted; no live business writes",
  status: checks.every((check) => !check.overflow && check.writes.every((request) => request === "POST /api/auth/refresh") && (check.status === 503
    ? check.retryVisible === true && check.requestIdVisible === true && !check.connectVisible
    : !check.retryVisible && check.connectVisible)) ? "PASS" : "FAIL",
  checks,
};
const output = process.env.PILOT_UAT_OUTPUT_PATH ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH) : path.join(root, "docs", "UAT_REPORTING_ERROR_LOCAL_2026-10-22.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
