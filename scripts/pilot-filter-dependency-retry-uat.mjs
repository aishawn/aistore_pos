import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const base = "https://demo.orithos.com.au";
const password = env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const cases = [
  { path: "/giftcards", endpoint: "/api/outlets", label: "Gift Cards outlets" },
];

const browser = await chromium.launch({ headless: true });
const results = [];
const writes = [];

try {
  for (const testCase of cases) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const login = await context.request.post(`${base}/api/auth/login`, {
      data: { username: "admin", password },
      headers: { Origin: base },
    });
    const loginBody = await login.json().catch(() => ({}));
    if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

    const page = await context.newPage();
    let injected = false;
    const requests = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/")) requests.push(`${request.method()} ${url.pathname}`);
      if (url.pathname.startsWith("/api/") && request.method() !== "GET" && !url.pathname.startsWith("/api/auth/")) {
        writes.push(`${request.method()} ${url.pathname}`);
      }
    });
    await page.route(`**${testCase.endpoint}**`, async (route) => {
      if (!injected && route.request().method() === "GET") {
        injected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Injected transient lookup failure" }),
        });
        return;
      }
      await route.continue();
    });

    try {
      await page.goto(`${base}${testCase.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByRole("heading", { name: "Gift Cards", exact: true }).waitFor({ timeout: 30000 });
      const notice = page.getByRole("alert").filter({ hasText: "Some lookup options could not be loaded." });
      await notice.waitFor({ state: "visible", timeout: 30000 });
      const retry = notice.getByRole("button", { name: "Retry", exact: true });
      await retry.click();
      await notice.waitFor({ state: "hidden", timeout: 30000 });
      results.push({ path: testCase.path, label: testCase.label, injected, recovered: true, requests, passed: true });
    } catch (error) {
      results.push({
        path: testCase.path,
        label: testCase.label,
        injected,
        recovered: false,
        requests,
        url: page.url(),
        bodyText: (await page.locator("body").innerText().catch(() => "")).slice(0, 400),
        passed: false,
        error: error instanceof Error ? error.message : "Unexpected failure",
      });
    } finally {
      await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  sourceCommit: "unverified-after-deploy",
  deployment: "unverified-after-deploy",
  target: base,
  scope: "read-only injected 503 recovery for filter lookups; no business writes",
  results,
  writes,
  passed: results.filter((result) => result.passed).length,
  failed: results.filter((result) => !result.passed).length,
};
const outputPath = path.join(root, "docs", "UAT_FILTER_DEPENDENCY_RETRY_2026-10-18.json");
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: report.passed, failed: report.failed, writes: writes.length }));
if (report.failed || writes.length) process.exitCode = 1;
