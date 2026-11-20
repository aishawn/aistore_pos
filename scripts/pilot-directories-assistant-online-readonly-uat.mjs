/** Real Demo directory search and assistant UI; all page API mutations blocked. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");
const base = process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au";
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_DIRECTORIES_ASSISTANT_ONLINE_CURRENT.json");
const screenshotDir = path.resolve(root, process.env.PILOT_UAT_SCREENSHOT_DIR ?? "docs/screenshots/directories-assistant-online");
fs.mkdirSync(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [];
const blockedWrites = [];
const readOnlyDatasetRequests = [];
const allowedSessionRequests = [];
let runtimeIdentity = { sourceCommit, frontendCommit: null, backendCommit: null, matchesSource: false };
const query = "ORITHOS_UAT_NO_MATCH_786592";
const routes = [
  { route: "/products", type: "products", heading: "Products", search: "Search product, barcode or SKU", empty: "No matching products", clear: "Clear filters" },
  { route: "/customers", type: "customers", heading: "Customers", search: "Search customers", empty: "No customers match this search.", clear: null },
  { route: "/suppliers", type: "suppliers", heading: "Suppliers", search: "Search", empty: "No suppliers found", clear: "Clear search" },
];
try {
  const context = await browser.newContext();
  const response = await context.request.post(`${base}/api/auth/login`, { data: { username: "admin", password }, headers: { Origin: base }, timeout: 60000 });
  const body = await response.json().catch(() => ({}));
  if (!response.ok() || body.code !== 0) throw new Error(`LOGIN_FAILED_${response.status()}`);
  const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
  if (!accessCookie || !body.data?.user) throw new Error("LOGIN_SESSION_MISSING_TOKEN_OR_USER");
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("sf_token", token);
    localStorage.setItem("sf_user", JSON.stringify(user));
  }, { token: accessCookie.value, user: body.data.user });
  try {
    const versionResponse = await context.request.get(`${base}/api/public/version`, { timeout: 15000 });
    const versionBody = await versionResponse.json().catch(() => ({}));
    runtimeIdentity = {
      sourceCommit,
      frontendCommit: versionBody.frontend?.commit ?? null,
      backendCommit: versionBody.backend?.commit ?? null,
      matchesSource: versionResponse.ok()
        && versionBody.frontend?.commit === sourceCommit
        && versionBody.backend?.commit === sourceCommit,
    };
  } catch {
    runtimeIdentity = { ...runtimeIdentity, unavailable: true };
  }
  checks.push({
    name: "deployed runtime SHA matches source",
    status: runtimeIdentity.matchesSource ? "PASS" : "BLOCKED",
    evidence: runtimeIdentity,
  });
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "POST" && pathname === "/api/auth/refresh") {
      allowedSessionRequests.push({ method: request.method(), path: pathname });
      return route.continue();
    }
    if (request.method() === "GET" && ["/api/products", "/api/customers", "/api/suppliers"].includes(pathname)) {
      const type = pathname.slice("/api/".length);
      readOnlyDatasetRequests.push({ type });
      return route.continue();
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      blockedWrites.push({ method: request.method(), path: new URL(request.url()).pathname });
      return route.fulfill({ status: 405, json: { code: 40500, message: "Read-only UAT blocks this request" } });
    }
    return route.continue();
  });
  for (const width of [320, 390, 1024, 1440]) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    const actualViewport = await page.evaluate(() => innerWidth);
    if (actualViewport !== width) throw new Error(`VIEWPORT_MISMATCH_${actualViewport}_${width}`);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const record = (name, ok, evidence = null) => checks.push({ viewport: width, actualViewport, name, status: ok ? "PASS" : "FAIL", evidence });
    for (const item of routes) {
      try {
        const response = await page.goto(`${base}${item.route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.getByRole("heading", { name: item.heading, exact: true }).waitFor({ timeout: 30000 });
        await page.waitForLoadState("networkidle", { timeout: 30000 });
        const search = page.getByPlaceholder(item.search, { exact: true });
        await search.fill(query);
        await page.waitForFunction(({ placeholder, value }) => [...document.querySelectorAll("input")]
          .some((input) => input.getAttribute("placeholder") === placeholder && input.value === value),
        { placeholder: item.search, value: query });
        record(`${item.heading} search input`, response?.status() === 200 && await search.inputValue() === query);
        await page.getByText(item.empty, { exact: true }).filter({ visible: true }).waitFor({ timeout: 30000 });
        record(`${item.heading} real empty search`, true);
        await page.screenshot({ path: path.join(screenshotDir, `${item.heading.toLowerCase()}-empty-${width}.png`), fullPage: true });
        if (item.clear) {
          await page.getByRole("button", { name: item.clear, exact: true }).filter({ visible: true }).last().click();
          await page.waitForFunction((placeholder) => [...document.querySelectorAll("input")]
            .some((input) => input.getAttribute("placeholder") === placeholder && input.value === ""), item.search);
          await page.getByText(item.empty, { exact: true }).filter({ visible: true }).waitFor({ state: "hidden", timeout: 30000 });
        } else {
          await search.fill("");
        }
        record(`${item.heading} clear search and layout`, await search.inputValue() === "" && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      } catch (error) {
        record(`${item.heading} run`, false, error instanceof Error ? error.message : "Unexpected failure");
      }
    }
    try {
      await page.goto(`${base}/stock/list`, { waitUntil: "networkidle", timeout: 60000 });
      const trigger = page.getByRole("button", { name: "Open Orithos AI assistant", exact: true });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "Orithos AI assistant", exact: true });
      await dialog.waitFor();
      const shortcuts = ["Today's sales", "What should I restock?", "Which prices should I review?", "Recommend a red wine under $30", "Something in stock for a BBQ under $20"];
      for (const label of shortcuts) await dialog.getByRole("button", { name: label, exact: true }).waitFor();
      let trapped = true;
      for (let index = 0; index < 12; index += 1) {
        await page.keyboard.press("Tab");
        trapped &&= await dialog.evaluate((element) => element.contains(document.activeElement));
      }
      await page.screenshot({ path: path.join(screenshotDir, `assistant-${width}.png`), fullPage: true });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      const focusRestored = await trigger.evaluate((element) => element === document.activeElement);
      record("header assistant shortcuts, focus trap and Escape restore", trapped && focusRestored, { shortcuts: shortcuts.length, trapped, focusRestored });
    } catch (error) {
      record("assistant run", false, error instanceof Error ? error.message : "Unexpected failure");
      await page.screenshot({ path: path.join(screenshotDir, `assistant-failure-${width}.png`), fullPage: true }).catch(() => null);
    }
    record("no page JS errors", errors.length === 0, errors);
    await page.close();
  }
  const requiredDatasetTypes = ["customers", "products", "suppliers"];
  const observedDatasetTypes = [...new Set(readOnlyDatasetRequests.map((request) => request.type))].sort();
  const missingDatasetTypes = requiredDatasetTypes.filter((type) => !observedDatasetTypes.includes(type));
  checks.push({
    name: "real read-only product, customer and supplier queries observed",
    status: missingDatasetTypes.length === 0 ? "PASS" : "FAIL",
    evidence: { observedDatasetTypes, missingDatasetTypes },
  });
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await context.close();
} catch (error) {
  checks.push({ name: "run", status: "FAIL", evidence: error instanceof Error ? error.message : "Unexpected failure" });
} finally {
  await browser.close();
}
const failed = checks.filter((check) => check.status === "FAIL").length;
const status = failed > 0 || blockedWrites.length > 0 ? "FAIL"
  : !runtimeIdentity.matchesSource ? "BLOCKED" : "PASS";
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit,
  runtimeIdentity,
  target: base,
  scope: "Real directory reads, auth session refresh and assistant UI only; other API mutations blocked; no model submissions or business writes",
  status,
  checks,
  blockedWrites,
  allowedSessionRequests,
  readOnlyDatasetRequests,
  screenshotDir: path.relative(root, screenshotDir).replaceAll(path.sep, "/"),
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, failed, blockedWrites: blockedWrites.length }));
if (output.status !== "PASS") process.exitCode = 1;
