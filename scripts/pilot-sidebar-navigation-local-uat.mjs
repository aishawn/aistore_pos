import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.PILOT_BASE_URL ?? "http://demo.localhost:3101").replace(/\/+$/, "");
const hostname = new URL(base).hostname;
if (!["localhost", "127.0.0.1"].includes(hostname) && !hostname.endsWith(".localhost")) {
  throw new Error("This navigation UAT is local-only.");
}

const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH
  ?? "docs/UAT_SIDEBAR_NAVIGATION_LOCAL_2026-10-24.json");
const screenshotDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR
  ?? "docs/screenshots/2026-10-24-sidebar-navigation");
const user = {
  id: 1,
  name: "Local UAT Admin",
  username: "admin",
  isAdmin: true,
  vendorId: 1,
  outletId: 1,
  pendingPasswordReset: false,
  platformOperator: false,
};
const checks = [];
const interceptedWrites = [];
const pageErrors = [];
const record = (name, ok, evidence = "") => checks.push({ name, status: ok ? "PASS" : "FAIL", evidence });
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] });

async function createPage(viewport) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: "orithos_access_token", value: "sidebar-navigation-fixture", url: base }]);
  await context.addInitScript((fixtureUser) => {
    localStorage.setItem("sf_token", "sidebar-navigation-fixture");
    localStorage.setItem("sf_user", JSON.stringify(fixtureUser));
  }, user);
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (data, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      interceptedWrites.push(`${method} ${url.pathname}`);
      return json({ message: "Navigation UAT blocked non-read API requests." }, 405);
    }
    if (url.pathname === "/api/auth/me") return json({ code: 0, message: "OK", data: user });
    if (url.pathname === "/api/odoo/session") {
      return json({ user: { name: "Fixture Odoo User", allowedCompanyIds: [41] }, autoRecoverConfigured: false });
    }
    if (url.pathname === "/api/odoo/pricelists") {
      return json({ items: [], limit: 40, offset: 0, hasNext: false });
    }
    if (url.pathname === "/api/ai/config/client") {
      return json({ code: 0, message: "OK", data: { enabled: false, aiTriggerKeywords: [] } });
    }
    if (url.pathname === "/api/tenant/sample-data/status") return json({ state: "inactive", canPurge: false });
    return json({ code: 0, message: "OK", data: [] });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { context, page };
}

try {
  const desktop = await createPage({ width: 1440, height: 900 });
  const desktopNav = desktop.page.locator('aside[aria-label="Main navigation"]');
  await desktop.page.goto(`${base}/assistant`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await desktopNav.waitFor({ state: "visible", timeout: 15000 });
  const assistantLink = desktopNav.getByRole("link", { name: "AI Assistant", exact: true });
  record("desktop sidebar remains visible on AI assistant page", await assistantLink.isVisible(), await desktop.page.url());
  const assistantLinkClass = await assistantLink.getAttribute("class") ?? "";
  record("AI assistant route is marked active", assistantLinkClass.includes("bg-[var(--oh-sidebar-active-pill)]"), assistantLinkClass);
  await desktopNav.getByRole("button", { name: "Customers", exact: true }).click();
  const customerLinks = ["Customers", "Groups", "Price Lists", "Balances", "Gift Cards"];
  const missingCustomerLinks = [];
  for (const label of customerLinks) {
    if (!await desktopNav.getByRole("link", { name: label, exact: true }).isVisible()) missingCustomerLinks.push(label);
  }
  record("customer menu exposes all Odoo destinations", missingCustomerLinks.length === 0, missingCustomerLinks.length ? `Missing: ${missingCustomerLinks.join(", ")}` : customerLinks.join(", "));
  await desktopNav.getByRole("link", { name: "Price Lists", exact: true }).click();
  await desktop.page.waitForURL(/\/pricelists$/);
  record("desktop sidebar navigation reaches Price Lists", await desktop.page.url().endsWith("/pricelists") && await desktopNav.isVisible(), await desktop.page.url());
  await desktop.page.screenshot({ path: path.join(screenshotDir, "sidebar-pricelists-1440.png"), fullPage: true });
  await desktop.context.close();

  const mobile = await createPage({ width: 390, height: 844 });
  const mobileNav = mobile.page.locator('aside[aria-label="Main navigation"]');
  await mobile.page.goto(`${base}/assistant`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const menuButton = mobile.page.getByRole("button", { name: "Open navigation menu", exact: true });
  await menuButton.waitFor({ state: "visible", timeout: 10000 });
  await menuButton.click();
  await mobileNav.waitFor({ state: "visible", timeout: 5000 });
  record("mobile navigation opens as a modal drawer", await mobileNav.getAttribute("role") === "dialog"
    && await mobileNav.getAttribute("aria-modal") === "true", `role=${await mobileNav.getAttribute("role")}; modal=${await mobileNav.getAttribute("aria-modal")}`);
  await mobileNav.getByRole("button", { name: "Customers", exact: true }).click();
  const mobilePrices = mobileNav.getByRole("link", { name: "Price Lists", exact: true });
  await mobilePrices.waitFor({ state: "visible", timeout: 5000 });
  await mobile.page.screenshot({ path: path.join(screenshotDir, "sidebar-mobile-open-390.png"), fullPage: true });
  await mobilePrices.click();
  await mobile.page.waitForURL(/\/pricelists$/);
  record("mobile destination navigation closes the drawer", await mobile.page.getByRole("button", { name: "Open navigation menu", exact: true }).getAttribute("aria-expanded") === "false"
    && await mobileNav.getAttribute("role") === null, await mobile.page.url());
  record("mobile customer destination is reachable", mobile.page.url().endsWith("/pricelists"), mobile.page.url());
  await mobile.context.close();

  record("navigation interactions have no browser runtime errors", pageErrors.length === 0, JSON.stringify(pageErrors));
  record("navigation interactions issue no API writes", interceptedWrites.length === 0, JSON.stringify(interceptedWrites));
} catch (error) {
  record("navigation UAT completed", false, error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

const failures = checks.filter((check) => check.status === "FAIL");
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceWorkingTreeDirty: execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim().length > 0,
  nodeVersion: process.version,
  environment: "local Next.js dev server; browser API fixtures",
  target: base,
  scope: "sidebar route visibility, customer navigation destinations, desktop/mobile drawer interaction",
  status: failures.length === 0 ? "PASS" : "FAIL",
  checks,
  screenshots: [
    path.relative(root, path.join(screenshotDir, "sidebar-pricelists-1440.png")).replaceAll(path.sep, "/"),
    path.relative(root, path.join(screenshotDir, "sidebar-mobile-open-390.png")).replaceAll(path.sep, "/"),
  ],
  interceptedWrites,
  pageErrors,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: checks.length - failures.length, total: checks.length, writes: interceptedWrites.length }));
if (failures.length) process.exitCode = 1;
