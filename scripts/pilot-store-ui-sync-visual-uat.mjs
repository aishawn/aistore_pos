import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3101";
const hostname = new URL(base).hostname;
const localPreviewHost = hostname === "demo.lvh.me" && new URL(base).port === "3102";
const productionVisualFixture = base === "https://demo.orithos.com.au";
if (!productionVisualFixture && !localPreviewHost && !["localhost", "127.0.0.1"].includes(hostname) && !hostname.endsWith(".localhost")) {
  throw new Error("Only local origins or the exact approved demo production origin accept these intercepted visual fixtures.");
}

const appRoot = path.join(root, "pos-ui", "app");
function collectStaticRoutes(directory, relative = "") {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) found.push(...collectStaticRoutes(child, next));
    else if (entry.name === "page.tsx" && !relative.split(path.sep).some((part) => part.startsWith("["))) {
      const route = `/${relative.replaceAll(path.sep, "/")}`.replace(/\/page\.tsx$/, "").replace(/\/+/g, "/");
      found.push(route === "/" ? "/" : route.replace(/\/$/, ""));
    }
  }
  return found;
}

const allRoutes = [...new Set(collectStaticRoutes(appRoot))].sort();
const routeFilter = process.env.PILOT_ROUTES?.split(",").map((route) => route.trim()).filter(Boolean);
const routes = routeFilter ? allRoutes.filter((route) => routeFilter.includes(route)) : allRoutes;
if (routeFilter && routes.length !== new Set(routeFilter).size) throw new Error("PILOT_ROUTES contains an unknown static route.");
const viewportWidths = process.env.PILOT_VIEWPORT_WIDTHS?.split(",").map((value) => Number(value.trim())) ?? [390, 1440];
if (!viewportWidths.length || viewportWidths.some((width) => !Number.isInteger(width) || width < 280 || width > 2560)) {
  throw new Error("PILOT_VIEWPORT_WIDTHS must contain integer viewport widths from 280 to 2560.");
}
const viewports = viewportWidths.map((width) => ({
  width,
  height: width <= 320 ? 740 : width <= 430 ? 844 : width === 768 ? 1024 : 900,
}));
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_LOCAL_STATIC_ROUTE_MATRIX_2026-10-23.json");
const screenshotDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR ?? "docs/screenshots/2026-10-23-local-static-route-matrix");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const user = { id: 1, username: "route-fixture", name: "Route Fixture", isAdmin: true, vendorId: 41, outletId: 1 };
const checks = [];
const writes = [];
const screenshots = [];
let readOnlyRecordPosts = 0;
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] });
const context = await browser.newContext({ viewport: viewports[0] });
await context.addCookies([{ name: "orithos_access_token", value: "route-matrix-fixture", url: base }]);
await context.addInitScript((fixtureUser) => {
  localStorage.setItem("sf_token", "route-matrix-fixture");
  localStorage.setItem("sf_user", JSON.stringify(fixtureUser));
}, user);

try {
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/odoo/records" && method === "POST") {
      readOnlyRecordPosts += 1;
      const body = request.postDataJSON() ?? {};
      const limit = Number.isFinite(Number(body.limit)) ? Number(body.limit) : 40;
      const offset = Number.isFinite(Number(body.offset)) ? Number(body.offset) : 0;
      return json({ items: [], limit, offset, hasNext: false });
    }
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      writes.push(`${method} ${url.pathname}`);
      return json({ message: "Local route matrix blocked a non-read request." }, 405);
    }
    if (url.pathname === "/api/auth/me") return json({ code: 0, data: user });
    if (url.pathname === "/api/odoo/session") return json({ user: { name: "Fixture Odoo User", allowedCompanyIds: [41] }, autoRecoverConfigured: false });
    if (url.pathname === "/api/tenant/sample-data/status") return json({ state: "inactive", canPurge: false });
    if (url.pathname === "/api/r2-archive/sales") return json({ items: [], hasNext: false });
    if (url.pathname === "/api/odoo/stocktake" && method === "GET") {
      return json({ code: 0, data: { locations: [], defaultLocationId: null, writeEnabled: false, products: [] } });
    }
    if (url.pathname === "/api/supply-chain/plan" && method === "GET") {
      return json({ code: 0, data: { id: 1, weekStart: "2026-10-19", weekEnd: "2026-10-25", productCount: 0, totalUnits: 0, estimatedSpend: 0, estimatedSaving: 0, ready: [], emails: [], other: [], lines: [] } });
    }
    if (url.pathname === "/api/odoo/reporting-dashboard") {
      const hours = Number(url.searchParams.get("hours") ?? 720);
      return json({
        rangeHours: hours, from: "2026-10-11T00:00:00Z", to: "2026-10-18T00:00:00Z", company: "Route Fixture", currency: "AUD", timezone: "Australia/Adelaide",
        sampleDataCleared: true, sampleDataClearedAt: null, trendGranularity: "day", revenue: 0, grossSales: 0, refunds: 0, refundTransactions: 0, tax: 0,
        transactions: 0, itemsSold: 0, openRegisters: 0, trend: [], recentSales: [], topProducts: [], byCategory: [],
        compare: { revenue: 0, transactions: 0, itemsSold: 0, revenueDeltaPct: null, transactionsDeltaPct: null, itemsSoldDeltaPct: null, averageSaleDeltaPct: null },
      });
    }
    return json({ code: 0, data: [] });
  });

  for (const viewport of viewports) {
    for (const route of routes) {
      const page = await context.newPage({ viewport });
      page.setDefaultTimeout(10000);
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      let status = 0;
      let overflow = null;
      let assistantControlOverlaps = [];
      let navigationError = null;
      try {
        const response = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
        status = response?.status() ?? 0;
          await page.waitForTimeout(600);
          assert.equal(new URL(page.url()).pathname, route, "Fixture must render the requested store route, not a control-plane redirect");
        const layout = await page.evaluate(() => {
          const floatingAssistant = [...document.querySelectorAll('button[aria-label="Open AI assistant"], button[aria-label="Open Orithos AI assistant"]')]
            .find((button) => getComputedStyle(button).position === "fixed");
          const overlaps = [];
          if (floatingAssistant) {
            const assistantRect = floatingAssistant.getBoundingClientRect();
            for (const control of document.querySelectorAll("button, input, select, textarea, a[href], [role=button]")) {
              if (control === floatingAssistant || floatingAssistant.contains(control) || !control.getClientRects().length) continue;
              const style = getComputedStyle(control);
              if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue;
              const rect = control.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) continue;
              if (assistantRect.left < rect.right && assistantRect.right > rect.left && assistantRect.top < rect.bottom && assistantRect.bottom > rect.top) {
                const label = control.getAttribute("aria-label") || control.getAttribute("name") || control.textContent?.trim().slice(0, 50) || control.tagName.toLowerCase();
                overlaps.push(`${control.tagName.toLowerCase()}:${label}`);
              }
            }
          }
          return { overflow: document.documentElement.scrollWidth > window.innerWidth + 1, assistantControlOverlaps: overlaps };
        });
        overflow = layout.overflow;
        assistantControlOverlaps = layout.assistantControlOverlaps;
      } catch (error) {
        navigationError = error instanceof Error ? error.message : String(error);
      }
      const check = { route, viewport: viewport.width, status, overflow, assistantControlOverlaps, pageErrors: [...pageErrors], navigationError };
      if (status !== 200 || overflow || assistantControlOverlaps.length || pageErrors.length || navigationError || process.env.PILOT_CAPTURE_SCREENSHOTS === "1") {
        const filename = `${viewport.width}-${route === "/" ? "home" : route.split("/").filter(Boolean).join("_")}.png`;
        fs.mkdirSync(screenshotDir, { recursive: true });
        const screenshotPath = path.join(screenshotDir, filename);
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
        screenshots.push(path.relative(root, screenshotPath).replaceAll("\\", "/"));
      }
      checks.push(check);
      console.log(`${status === 200 && !overflow && !assistantControlOverlaps.length && !pageErrors.length && !navigationError ? "PASS" : "FAIL"} ${viewport.width} ${route} ${status}${overflow ? " OVERFLOW" : ""}${assistantControlOverlaps.length ? ` ASSISTANT_CONTROL_OVERLAP=${assistantControlOverlaps.length}` : ""}${pageErrors.length ? ` PAGE_ERRORS=${pageErrors.length}` : ""}${navigationError ? ` NAV=${navigationError}` : ""}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const failures = checks.filter((check) => check.status !== 200 || check.overflow || check.assistantControlOverlaps.length || check.pageErrors.length || check.navigationError);
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceWorkingTreeDirty: execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim().length > 0,
  target: base,
  environment: `local Next.js dev server; Playwright runner Node ${process.version}; browser API fixtures`,
  routeCount: routes.length,
  routeFilter: routeFilter ?? null,
  viewports: viewports.map(({ width }) => width),
  checksPassed: checks.length - failures.length,
  checksTotal: checks.length,
  failures,
  checks,
  screenshots,
  interceptedWrites: writes,
  interceptedReadOnlyRecordPosts: readOnlyRecordPosts,
  productionBusinessWrites: 0,
  status: failures.length === 0 && writes.length === 0 ? "PASS" : "FAIL",
  screenshotDirectory: screenshots.length ? path.relative(root, screenshotDir).replaceAll("\\", "/") : null,
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, routes: output.routeCount, passed: output.checksPassed, total: output.checksTotal, failures: failures.length, interceptedWrites: writes.length }));
if (output.status !== "PASS") process.exitCode = 1;
