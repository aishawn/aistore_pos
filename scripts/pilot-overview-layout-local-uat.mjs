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

const widths = [320, 390, 768, 1024, 1440];
const screenshotDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR ?? "docs/screenshots/2026-10-23-reports-layout-rehomed");
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_REPORTS_LAYOUT_REHOMED_2026-10-23.json");
fs.mkdirSync(screenshotDir, { recursive: true });
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const user = { id: 1, username: "overview-fixture", name: "Overview Fixture", isAdmin: true, vendorId: 41, outletId: 1 };
const writes = [];
const checks = [];
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] });

function reportingPayload(hours) {
  const count = hours === 168 ? 7 : 12;
  const trend = Array.from({ length: count }, (_, index) => ({
    label: new Date(Date.UTC(2026, 9, 18 - (count - index - 1))).toISOString(),
    revenue: (index + 1) * 27.5,
    transactions: index + 1,
  }));
  return {
    rangeHours: hours,
    from: "2026-10-11T00:00:00Z",
    to: "2026-10-18T00:00:00Z",
    company: `Fixture ${hours}h`,
    currency: "AUD",
    timezone: "Australia/Adelaide",
    sampleDataCleared: true,
    sampleDataClearedAt: null,
    trendGranularity: "day",
    revenue: 1234.5,
    grossSales: 1234.5,
    refunds: 20,
    refundTransactions: 1,
    tax: 112.23,
    transactions: 18,
    itemsSold: 24,
    openRegisters: 1,
    trend,
    recentSales: [],
    topProducts: [{ id: 1, name: "Fixture Shiraz", qty: 4, revenue: 110 }],
    byCategory: [{ name: "Wine", share: 70 }, { name: "Beer", share: 30 }],
    compare: { revenue: 0, transactions: 0, itemsSold: 0, revenueDeltaPct: null, transactionsDeltaPct: null, itemsSoldDeltaPct: null, averageSaleDeltaPct: null },
  };
}

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addCookies([{ name: "orithos_access_token", value: "overview-layout-fixture", url: base }]);
    await context.addInitScript((fixtureUser) => {
      localStorage.setItem("sf_token", "overview-layout-fixture");
      localStorage.setItem("sf_user", JSON.stringify(fixtureUser));
    }, user);

    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const fulfill = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

      if (url.pathname === "/api/auth/me" && method === "GET") return fulfill({ code: 0, data: user });
      if (url.pathname === "/api/odoo/session" && method === "GET") return fulfill({ user: { name: "Fixture Odoo User", allowedCompanyIds: [41] }, autoRecoverConfigured: false });
      if (url.pathname === "/api/odoo/reporting-dashboard" && method === "GET") {
        const hours = Number(url.searchParams.get("hours"));
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
    await page.getByText("Fixture 720h", { exact: true }).waitFor();

    const layout = await page.evaluate(() => {
      const card = (name) => {
        const heading = [...document.querySelectorAll("h2")].find((item) => item.textContent?.trim() === name);
        const section = heading?.closest("section");
        if (!section) return null;
        const rect = section.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const plot = document.querySelector('[aria-describedby="reports-sales-trend-summary"]');
      const plotRect = plot?.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        topProducts: card("Top products"),
        trend: card("Sales trend"),
        categories: card("Sales by category"),
        plotHeight: plotRect?.height ?? 0,
        plotWidth: plotRect?.width ?? 0,
        trendPoints: document.querySelectorAll('[aria-describedby="reports-sales-trend-summary"] [role="img"][tabindex="0"]').length,
      };
    });

    assert.ok(layout.topProducts && layout.trend && layout.categories, `missing dashboard sections at ${width}px`);
    assert.ok(layout.scrollWidth <= width, `horizontal overflow at ${width}px: ${layout.scrollWidth}`);
    assert.ok(layout.plotHeight >= 140, `trend plot collapsed at ${width}px: ${layout.plotHeight}px`);
    assert.ok(layout.plotWidth > 0, `trend plot has no width at ${width}px`);
    assert.ok(layout.topProducts.bottom <= layout.trend.y + 1, `trend overlaps top products at ${width}px`);
    if (width < 640) assert.ok(layout.trend.bottom <= layout.categories.y + 1, `category card overlaps trend at ${width}px`);
    else assert.ok(layout.trend.right <= layout.categories.x + 1 || layout.categories.right <= layout.trend.x + 1, `trend and category cards overlap at ${width}px`);
    assert.equal(layout.trendPoints, 12);
    checks.push({ width, name: "Reports cards and trend plot remain visible without overlap or overflow", status: "PASS", layout });

    const aiLauncher = page.getByRole("button", { name: "Open Orithos AI assistant" });
    assert.equal(await aiLauncher.count(), 1, `Reports should have one AI entry at ${width}px`);
    assert.equal(await page.locator('[aria-label="Open Orithos AI assistant"]').count(), 1, `floating AI entry overlaps page content at ${width}px`);
    await aiLauncher.click();
    const assistantDialog = page.getByRole("dialog", { name: "Orithos AI assistant" });
    await assistantDialog.waitFor({ state: "visible" });
    await assistantDialog.getByRole("button", { name: "Close assistant" }).click();
    await assistantDialog.waitFor({ state: "hidden" });
    checks.push({ width, name: "Reports AI entry opens/closes the accessible assistant", status: "PASS" });

    const rangeGroup = page.getByRole("group", { name: "Odoo sales reporting range" });
    await rangeGroup.getByRole("button", { name: "7 days", exact: true }).click();
    await page.getByText("Fixture 168h", { exact: true }).waitFor();
    assert.equal(await rangeGroup.getByRole("button", { name: "7 days", exact: true }).getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator('[aria-describedby="reports-sales-trend-summary"] [role="img"][tabindex="0"]').count(), 7);
    checks.push({ width, name: "range control updates data and keeps trend bars keyboard-addressable", status: "PASS" });

    await page.screenshot({ path: path.join(screenshotDir, `overview-${width}.png`), fullPage: true });
    assert.deepEqual(pageErrors, [], `page errors at ${width}px: ${pageErrors.join("; ")}`);
    await context.close();
  }
} finally {
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceWorkingTreeDirty: execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim().length > 0,
  target: base,
  environment: `local Next.js dev server; Node ${process.version}; browser API fixtures`,
  scope: "Reports trend layout, responsive cards, AI launcher placement and accessible dialog toggle, range switching and keyboard access; API requests intercepted",
  status: writes.length === 0 && checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL",
  passed: checks.filter((check) => check.status === "PASS").length,
  failed: checks.filter((check) => check.status === "FAIL").length,
  productionBusinessWrites: 0,
  interceptedWrites: writes,
  checks,
  screenshots: widths.map((width) => path.relative(root, path.join(screenshotDir, `overview-${width}.png`)).replaceAll("\\", "/")),
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: output.passed, failed: output.failed, productionBusinessWrites: output.productionBusinessWrites }));
if (output.failed) process.exitCode = 1;
