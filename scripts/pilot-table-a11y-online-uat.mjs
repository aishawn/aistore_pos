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
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
const sourceCommit = process.env.PILOT_SOURCE_COMMIT ?? execGitHead();
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

function execGitHead() {
  return process.env.GIT_COMMIT ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

const routes = [
  { path: "/settings/users", label: "store users" },
  { path: "/settings/roles", label: "store roles" },
  { path: "/reports/ai/metrics", label: "AI metrics" },
  { path: "/products/odoo", label: "Odoo products" },
  { path: "/stock/stocktake", label: "stocktake" },
  { path: "/orders/new", label: "supply chain" },
  { path: "/invoices/scan", label: "invoice scan" },
];
const viewports = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const checks = [];
const blockedNonGet = [];
const safeNonGetPaths = new Set(["/api/odoo/records", "/api/auth/refresh"]);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: viewports[0] });

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password, subdomain: process.env.PILOT_SUBDOMAIN ?? env.PILOT_SUBDOMAIN ?? "demo" },
    headers: { Origin: base, "X-Orithos-Tenant-Slug": process.env.PILOT_SUBDOMAIN ?? env.PILOT_SUBDOMAIN ?? "demo" },
    timeout: 60000,
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  for (const viewport of viewports) {
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        blockedNonGet.push(`${request.method()} ${new URL(request.url()).pathname}`);
        return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "Read-only UAT blocked this request", data: null }) });
      }
      return route.continue();
    });

    for (const route of routes) {
      pageErrors.length = 0;
      let response = await page.goto(`${base}${route.path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
      if (response?.status() !== 200) {
        await page.waitForTimeout(2000);
        response = await page.goto(`${base}${route.path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
      }
      await page.waitForTimeout(2500);
      let unnamedControls = 0;
      let suggestionsAfterClear = 0;
      if (route.path === "/orders/new") {
        const settingsButton = page.getByRole("button", { name: "Rules & prices", exact: true });
        if (await settingsButton.isVisible().catch(() => false)) {
          await settingsButton.click();
          await page.waitForTimeout(1500);
          unnamedControls = await page.locator("input:not([type='hidden']), select, textarea").evaluateAll((controls) => controls.filter((control) => {
            const labelled = control.getAttribute("aria-label") || control.getAttribute("aria-labelledby");
            const label = control.id ? document.querySelector(`label[for='${CSS.escape(control.id)}']`) : control.closest("label");
            return !labelled && !label && !control.getAttribute("placeholder");
          }).length);
          const productSearch = page.getByRole("textbox", { name: "Search products for supplier pricing", exact: true });
          if (await productSearch.isVisible().catch(() => false)) {
            await productSearch.fill("a");
            await page.waitForTimeout(700);
            await productSearch.fill("");
            await page.waitForTimeout(450);
            suggestionsAfterClear = await productSearch.locator("xpath=following-sibling::div[1]//button").count();
          }
        }
      }
      const result = await page.locator("table").evaluateAll((tables) => tables.map((table) => ({
        name: table.getAttribute("aria-label") || table.querySelector("caption")?.textContent?.trim() || "",
        headers: [...(table.querySelectorAll("thead th").length
          ? table.querySelectorAll("thead th")
          : table.querySelectorAll("tr:first-child > th"))].map((header) => header.getAttribute("scope") || ""),
      })));
      const named = result.every((table) => table.name.length > 0);
      const scoped = result.every((table) => table.headers.every((scope) => scope === "col"));
      const pass = response?.status() === 200 && named && scoped && unnamedControls === 0 && suggestionsAfterClear === 0 && pageErrors.length === 0;
      checks.push({
        name: `${route.label} ${viewport.width}px`,
        status: pass ? "PASS" : "FAIL",
        detail: `http=${response?.status() ?? 0} tables=${result.length} named=${named} scoped=${scoped} unnamedControls=${unnamedControls} suggestionsAfterClear=${suggestionsAfterClear} pageErrors=${pageErrors.length}`,
        tables: result,
      });
    }
    await page.close();
  }
} finally {
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit,
  deployment: /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
    ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase()
    : "unverified-after-deploy",
  target: base,
  scope: "authenticated read-only table accessibility regression; non-GET API calls blocked",
  checks,
  blockedNonGet,
  unexpectedWrites: blockedNonGet.filter((entry) => !safeNonGetPaths.has(entry.slice(entry.indexOf("/")))),
  status: checks.every((check) => check.status === "PASS") && blockedNonGet.filter((entry) => !safeNonGetPaths.has(entry.slice(entry.indexOf("/")))).length === 0 ? "PASS" : "FAIL",
};
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_TABLE_A11Y_ONLINE_CURRENT.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: checks.filter((check) => check.status === "PASS").length, failed: checks.filter((check) => check.status === "FAIL").length, blockedNonGet: blockedNonGet.length, unexpectedWrites: output.unexpectedWrites.length }));
if (output.status !== "PASS") process.exitCode = 1;
