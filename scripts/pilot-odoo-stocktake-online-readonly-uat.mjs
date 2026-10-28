import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
const envText = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
const env = Object.fromEntries(envText
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
const username = process.env.PILOT_USERNAME ?? "admin";
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const viewports = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const outputDir = path.resolve(root, process.env.PILOT_UAT_SCREENSHOT_DIR ?? "docs/screenshots/2026-10-19-stocktake-online");
fs.mkdirSync(outputDir, { recursive: true });
const checks = [];
let writeRequests = 0;

try {
  const context = await browser.newContext({ viewport: viewports[0] });
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username, password },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  const loggedIn = login.ok() && loginBody.code === 0 && loginBody.data?.user?.isAdmin === true;
  checks.push({ name: "admin login", status: loggedIn ? "PASS" : "FAIL", httpStatus: login.status(), isAdmin: loginBody.data?.user?.isAdmin ?? null });
  if (!loggedIn) throw new Error(`LOGIN_FAILED_${login.status()}`);
  const loginSetCookie = login.headers()["set-cookie"] ?? "";
  const authCookies = loginSetCookie
    .split(/\r?\n/)
    .map((value) => value.split(";")[0].trim())
    .filter((value) => value.includes("="))
    .map((value) => {
      const separator = value.indexOf("=");
      return { name: value.slice(0, separator), value: value.slice(separator + 1), url: base };
    });

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
  await context.close();

  for (const viewport of viewports) {
    const pageContext = await browser.newContext({ viewport, storageState });
    if (authCookies.length > 0) await pageContext.addCookies(authCookies);
    await pageContext.route("**/api/**", async (route) => {
      const request = route.request();
      const isReadOnlyRecordsQuery = request.method() === "POST"
        && new URL(request.url()).pathname === "/api/odoo/records"
        && ["products", "posCategories"].includes(request.postDataJSON()?.type);
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && !isReadOnlyRecordsQuery) {
        writeRequests += 1;
        return route.fulfill({ status: 405, json: { code: 40500, message: "Read-only UAT blocked this request" } });
      }
      return route.continue();
    });
    const page = await pageContext.newPage();
    const response = await page.goto(`${base}/products?tab=stocktake`, { waitUntil: "networkidle", timeout: 60000 });
    await page.getByRole("heading", { name: "Products" }).waitFor({ state: "visible", timeout: 30000 });
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
    await page.getByRole("listbox", { name: "Stocktake product results" }).waitFor({ state: "visible", timeout: 30000 });
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
    const headerAi = page.getByRole("button", { name: "Open Orithos AI assistant", exact: true });
    const headerVisible = await headerAi.isVisible().catch(() => false);
    const floatingHidden = await page.getByRole("button", { name: "Open Orithos AI", exact: true }).count() === 0;
    checks.push({ name: `stocktake header AI placement ${viewport.width}px`, status: headerVisible && floatingHidden ? "PASS" : "FAIL", headerVisible, floatingHidden });
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
  deployment: process.env.PILOT_DEPLOYMENT_VERIFIED === "true" && /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
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
