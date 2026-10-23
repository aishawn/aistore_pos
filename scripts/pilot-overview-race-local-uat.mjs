// Legacy analytics coverage belongs to Reports; Overview now owns the launcher.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3101";
const hostname = new URL(base).hostname;
if (!["localhost", "127.0.0.1"].includes(hostname) && !hostname.endsWith(".localhost")) {
  throw new Error("This fixture UAT is local-only.");
}

const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_REPORTS_RACE_REHOMED_2026-10-23.json");
const screenshotPath = path.resolve(root, "docs/screenshots/2026-10-23-reports-race-rehomed/reports-race.png");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });

const user = { id: 1, username: "overview-fixture", name: "Overview Fixture", isAdmin: true, vendorId: 41, outletId: 1 };
const requests = [];
const writes = [];
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] });

function reportingPayload(hours) {
  const marker = hours === 24 ? "FIXTURE-STALE-24H" : hours === 168 ? "FIXTURE-LATEST-7D" : `FIXTURE-${hours}H`;
  return {
    rangeHours: hours,
    from: "2026-10-11T00:00:00Z",
    to: "2026-10-18T00:00:00Z",
    company: marker,
    currency: "AUD",
    timezone: "Australia/Adelaide",
    sampleDataCleared: true,
    sampleDataClearedAt: null,
    trendGranularity: "day",
    revenue: hours,
    grossSales: hours,
    refunds: 0,
    refundTransactions: 0,
    tax: 0,
    transactions: hours,
    itemsSold: hours,
    openRegisters: 0,
    trend: [{ label: "2026-10-18T00:00:00Z", revenue: hours, transactions: hours }],
    recentSales: [],
    topProducts: [],
    byCategory: [],
    compare: { revenue: 0, transactions: 0, itemsSold: 0, revenueDeltaPct: null, transactionsDeltaPct: null, itemsSoldDeltaPct: null, averageSaleDeltaPct: null },
  };
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "orithos_access_token", value: "overview-race-fixture", url: base }]);
  await context.addInitScript((fixtureUser) => {
    localStorage.setItem("sf_token", "overview-race-fixture");
    localStorage.setItem("sf_user", JSON.stringify(fixtureUser));
  }, user);

  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const fulfill = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (url.pathname === "/api/auth/me" && method === "GET") return fulfill({ code: 0, data: user });
    if (url.pathname === "/api/odoo/session" && method === "GET") return fulfill({ user: { name: "Fixture Odoo User", allowedCompanyIds: [41] }, autoRecoverConfigured: false });
    if (url.pathname === "/api/odoo/reporting-dashboard" && method === "GET") {
      const hours = Number(url.searchParams.get("hours"));
      requests.push({ hours, method });
      if (hours === 24) await new Promise((resolve) => setTimeout(resolve, 900));
      return fulfill(reportingPayload(hours));
    }
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      writes.push(`${method} ${url.pathname}`);
      return fulfill({ message: "Fixture blocked unexpected write" }, 405);
    }
    if (url.pathname.includes("r2") || url.pathname.includes("archive")) return fulfill({ items: [], hasNext: false });
    return fulfill({ code: 0, data: {} });
  });

  await page.goto(`${base}/reports/dashboard`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.getByRole("heading", { name: "Sales trend", exact: true }).waitFor();
  await page.getByText("FIXTURE-720H", { exact: true }).waitFor();
  const rangeGroup = page.getByRole("group", { name: "Odoo sales reporting range" });
  await rangeGroup.getByRole("button", { name: "24 hours", exact: true }).click();
  await page.waitForFunction(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("reporting-dashboard?hours=24")));
  await rangeGroup.getByRole("button", { name: "7 days", exact: true }).click();
  await page.getByText("FIXTURE-LATEST-7D", { exact: true }).waitFor();
  await page.waitForTimeout(1100);

  const visibleText = (await page.locator("#main-content").innerText()).replace(/\s+/g, " ");
  assert.ok(visibleText.includes("FIXTURE-LATEST-7D"), "latest 7-day result should remain visible");
  assert.ok(!visibleText.includes("FIXTURE-STALE-24H"), "stale 24-hour result must not overwrite latest data");
  assert.ok(requests.some((request) => request.hours === 24) && requests.some((request) => request.hours === 168), "both competing requests should be observed");
  assert.deepEqual(writes, [], "fixture run must not issue any API writes");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await context.close();
} finally {
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceWorkingTreeDirty: execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim().length > 0,
  target: base,
  environment: `local Next.js dev server; Node ${process.version}; browser API fixtures`,
  scope: "Overview stale-response race: delayed 24-hour response must not overwrite the newer 7-day result; all API calls intercepted",
  status: writes.length === 0 ? "PASS" : "FAIL",
  requests,
  interceptedWrites: writes,
  productionBusinessWrites: 0,
  screenshot: path.relative(root, screenshotPath).replaceAll("\\", "/"),
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, requests: output.requests, productionBusinessWrites: 0 }));
