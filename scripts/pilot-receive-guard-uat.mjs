import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
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
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");

const base = "https://app.orithos.com.au";
const deployment = process.env.PILOT_DEPLOYMENT_SHA || null;
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const scenarios = [
  {
    route: "/orders/receive/new",
    apiPath: "/api/suppliers",
    heading: "Receive Stock",
    message: "Suppliers could not be loaded. Refresh and try again before receiving stock.",
  },
  {
    route: "/orders/receive/new",
    apiPath: "/api/outlets",
    heading: "Receive Stock",
    message: "The destination outlet could not be loaded. Refresh and try again before receiving stock.",
  },
  {
    route: "/orders/return/new",
    apiPath: "/api/suppliers",
    heading: "Return Stock",
    message: "Suppliers could not be loaded. Refresh and try again before returning stock.",
  },
  {
    route: "/orders/return/new",
    apiPath: "/api/outlets",
    heading: "Return Stock",
    message: "The source outlet could not be loaded. Refresh and try again before returning stock.",
  },
];

const browser = await chromium.launch({ headless: true });
const results = [];
const errors = [];
const writes = [];

for (const width of [390, 1440]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
    headers: { Origin: base },
    timeout: 60000,
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  for (const scenario of scenarios) {
    const page = await context.newPage();
    let intercepted = 0;
    page.on("pageerror", (error) => errors.push(`${width}px ${scenario.route}: ${error.message}`));
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (request.method() !== "GET" && pathname.startsWith("/api/")) {
        writes.push(`${width}px ${request.method()} ${pathname}`);
      }
    });
    const routePattern = "**/api/**";
    const failDependency = async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === scenario.apiPath) {
        intercepted += 1;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: 50300, message: "UAT simulated dependency failure" }),
        });
      } else {
        await route.continue();
      }
    };

    await page.route(routePattern, failDependency);
    await page.goto(`${base}${scenario.route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: scenario.heading, exact: true }).waitFor({ state: "visible", timeout: 30000 });
    await page.getByRole("status").filter({ hasText: scenario.message }).waitFor({ state: "visible", timeout: 30000 });
    const createButton = page.getByRole("button", { name: "Create", exact: true });
    await createButton.waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(500);

    const state = await page.evaluate(() => ({
      width: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    const disabled = !(await createButton.isEnabled());
    const pass = intercepted > 0
      && disabled
      && state.documentWidth <= width
      && state.bodyWidth <= width
      && !writes.some((write) => write.includes("/api/orders/receive") || write.includes("/api/orders/return"));
    results.push({
      viewport: width,
      route: scenario.route,
      unavailableDependency: scenario.apiPath,
      interceptedRequests: intercepted,
      createDisabled: disabled,
      documentWidth: state.documentWidth,
      bodyWidth: state.bodyWidth,
      statusMessage: scenario.message,
      status: pass ? "PASS" : "FAIL",
    });
    await page.unroute(routePattern, failDependency);
    await page.close();
  }
  await context.close();
}

await browser.close();
const report = {
  generatedAt: new Date().toISOString(),
  sourceCommit,
  deployment,
  target: base,
  scope: "production UI safety guard checks; supplier/outlet failures simulated in browser; no purchase, receipt, return, or inventory writes",
  scenarios: results,
  sideEffects: { mutatingApiRequests: writes, pageErrors: errors },
  passed: results.filter((item) => item.status === "PASS").length,
  failed: results.filter((item) => item.status !== "PASS").length,
};
const outputPath = path.join(root, "docs/UAT_RECEIVE_GUARD_2026-10-14.json");
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: report.passed, failed: report.failed, writes, errors }));
if (report.failed || writes.length || errors.length) process.exitCode = 1;
