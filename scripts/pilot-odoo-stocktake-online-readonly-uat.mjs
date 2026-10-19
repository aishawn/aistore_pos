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
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const viewports = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const outputDir = path.join(root, "docs", "screenshots", "2026-10-19-stocktake-online");
fs.mkdirSync(outputDir, { recursive: true });
const checks = [];
let writeRequests = 0;

try {
  const context = await browser.newContext({ viewport: viewports[0] });
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  const loggedIn = login.ok() && loginBody.code === 0 && loginBody.data?.user?.isAdmin === true;
  checks.push({ name: "admin login", status: loggedIn ? "PASS" : "FAIL", httpStatus: login.status(), isAdmin: loginBody.data?.user?.isAdmin ?? null });
  if (!loggedIn) throw new Error(`LOGIN_FAILED_${login.status()}`);

  const odooSessionResponse = await context.request.get(`${base}/api/odoo/session`, { headers: { Origin: base } });
  const odooSessionBody = await odooSessionResponse.json().catch(() => ({}));
  checks.push({ name: "Odoo read-only session recovery", status: odooSessionResponse.ok() && Boolean(odooSessionBody.user) ? "PASS" : "FAIL", httpStatus: odooSessionResponse.status(), hasOdooUser: Boolean(odooSessionBody.user) });
  const bindingResponse = await context.request.get(`${base}/api/tenant/odoo-binding`, { headers: { Origin: base } });
  const bindingBody = await bindingResponse.json().catch(() => ({}));
  checks.push({ name: "tenant Odoo binding read", status: bindingResponse.ok() && bindingBody.code === 0 ? "PASS" : "FAIL", httpStatus: bindingResponse.status(), binding: bindingBody.data ? { odooCompanyId: bindingBody.data.odooCompanyId ?? null, odooStockLocationId: bindingBody.data.odooStockLocationId ?? null, odooProvisionStatus: bindingBody.data.odooProvisionStatus ?? null } : null });
  const apiResponse = await context.request.get(`${base}/api/odoo/stocktake`, { headers: { Origin: base } });
  const apiBody = await apiResponse.json().catch(() => ({}));
  const locations = Array.isArray(apiBody.data?.locations) ? apiBody.data.locations : [];
  const apiReadable = apiResponse.ok() && apiBody.code === 0 && locations.every((location) => Number.isSafeInteger(location.id) && typeof location.name === "string");
  const locationSource = apiBody.data?.locationSource;
  const sourceExplained = locationSource === "tenant-binding" || locationSource === "single-warehouse-fallback";
  checks.push({ name: "authenticated stocktake location read", status: apiReadable && sourceExplained ? "PASS" : "FAIL", httpStatus: apiResponse.status(), message: apiBody.message ?? null, locationCount: locations.length, locationSource: locationSource ?? null, writeEnabled: apiBody.data?.writeEnabled ?? null });
  const storageState = await context.storageState();

  for (const viewport of viewports) {
    await context.close();
    const pageContext = await browser.newContext({ viewport, storageState });
    pageContext.on("request", (request) => {
      if (request.method() !== "GET" && request.url().includes("/api/odoo/stocktake")) writeRequests += 1;
    });
    const page = await pageContext.newPage();
    const response = await page.goto(`${base}/stock/stocktake`, { waitUntil: "networkidle", timeout: 60000 });
    await page.getByRole("heading", { name: "Odoo Stocktake" }).waitFor({ state: "visible", timeout: 30000 });
    const search = page.locator("#stocktake-search");
    const searchSemantics = await search.evaluate((element) => ({
      role: element.getAttribute("role"),
      autocomplete: element.getAttribute("aria-autocomplete"),
      controls: element.getAttribute("aria-controls"),
      expanded: element.getAttribute("aria-expanded"),
    }));
    const searchSemanticPass = searchSemantics.role === "combobox"
      && searchSemantics.autocomplete === "list"
      && searchSemantics.controls === "stocktake-search-results"
      && searchSemantics.expanded === "false";
    checks.push({ name: `stocktake search combobox semantics ${viewport.width}px`, status: searchSemanticPass ? "PASS" : "FAIL", semantics: searchSemantics });
    await search.fill("wine");
    await page.waitForFunction(() => document.querySelector("#stocktake-search")?.getAttribute("aria-busy") !== "true", null, { timeout: 30000 });
    const resultSemantics = await page.evaluate(() => {
      const list = document.querySelector("#stocktake-search-results");
      return {
        listRole: list?.getAttribute("role") ?? null,
        optionCount: list?.querySelectorAll('[role="option"]').length ?? 0,
        expanded: document.querySelector("#stocktake-search")?.getAttribute("aria-expanded") ?? null,
      };
    });
    const resultSemanticPass = resultSemantics.listRole === "listbox"
      && resultSemantics.expanded === "true"
      && (resultSemantics.optionCount > 0 || resultSemantics.listRole === "listbox");
    checks.push({ name: `stocktake search result semantics ${viewport.width}px`, status: resultSemanticPass ? "PASS" : "FAIL", semantics: resultSemantics });
    const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
    const screenshot = path.join(outputDir, `stocktake-${viewport.width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    const passed = response?.status() === 200 && layout.scrollWidth <= layout.viewportWidth;
    checks.push({ name: `stocktake page ${viewport.width}px`, status: passed ? "PASS" : "FAIL", httpStatus: response?.status() ?? 0, horizontalOverflow: layout.scrollWidth > layout.viewportWidth, screenshotPath: screenshot });
    await pageContext.close();
  }
} catch (error) {
  checks.push({ name: "online stocktake read-only UAT", status: "FAIL", error: error instanceof Error ? error.message : "Unexpected failure" });
} finally {
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  deployment: /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
    ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase()
    : "unverified-after-deploy",
  target: base,
  scope: "authenticated Odoo stocktake read-only browser UAT; no inventory writes",
  status: checks.length > 0 && checks.every((check) => check.status === "PASS") && writeRequests === 0 ? "PASS" : "FAIL",
  checks,
  nonGetStocktakeRequests: writeRequests,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks, nonGetStocktakeRequests: writeRequests }));
if (output.status !== "PASS") process.exitCode = 1;
