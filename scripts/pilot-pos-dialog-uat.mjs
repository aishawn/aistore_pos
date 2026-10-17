import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const host = "https://demo.orithos.com.au";
const viewports = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const outputDir = path.join(root, "docs", "screenshots", "2026-10-17-pos-dialog");
fs.mkdirSync(outputDir, { recursive: true });

function currentCommit() {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { return null; }
}

const browser = await chromium.launch({ headless: true });
const results = [];
for (const viewport of viewports) {
  const context = await browser.newContext({ viewport });
  const login = await context.request.post(`${host}/api/auth/login`, { data: { username: "admin", password }, headers: { Origin: host } });
  const body = await login.json().catch(() => ({}));
  if (!login.ok() || body.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  const page = await context.newPage();
  const response = await page.goto(`${host}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const helpButton = page.getByRole("button", { name: "POS help and recovery" });
  await helpButton.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  const buttonCount = await helpButton.count();
  if (buttonCount !== 1) {
    console.error(JSON.stringify({ viewport: viewport.width, url: page.url(), title: await page.title(), body: (await page.locator("body").innerText()).slice(0, 600) }));
    throw new Error(`HELP_BUTTON_COUNT_${viewport.width}_${buttonCount}`);
  }
  await helpButton.click();
  const dialog = page.getByRole("dialog", { name: "POS help and recovery" });
  const visibleBefore = await dialog.isVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const visibleAfter = await dialog.isVisible().catch(() => false);
  const keyboardChecks = { salesKeys: null, parkedSales: null, functionGrid: null };
  if (viewport.width >= 1024) {
    const salesKeys = page.getByRole("button", { name: "Sales Keys", exact: true });
    const parkedSales = page.getByRole("button", { name: "Parked Sales", exact: true });
    await salesKeys.waitFor({ state: "visible", timeout: 15000 });
    await parkedSales.waitFor({ state: "visible", timeout: 15000 });

    await parkedSales.focus();
    await page.keyboard.press("Enter");
    await page.getByText("No parked sales", { exact: true }).waitFor({ timeout: 15000 });
    keyboardChecks.parkedSales = true;

    await salesKeys.focus();
    await page.keyboard.press("Enter");
    const moreFunctions = page.getByRole("button", { name: "more-functions", exact: true });
    await moreFunctions.waitFor({ state: "visible", timeout: 15000 });
    await moreFunctions.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Back Home", exact: true }).waitFor({ state: "visible", timeout: 15000 });
    keyboardChecks.salesKeys = true;
    keyboardChecks.functionGrid = true;
  }
  const screenshot = `docs/screenshots/2026-10-17-pos-dialog/pos-help-${viewport.width}.png`;
  await page.screenshot({ path: path.join(root, screenshot), fullPage: true });
  results.push({ viewport: viewport.width, status: response?.status() ?? null, visibleBefore, visibleAfter, keyboardChecks, screenshot });
  await context.close();
}
await browser.close();

const failures = results.filter((result) => result.status !== 200 || !result.visibleBefore || result.visibleAfter);
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: currentCommit(),
  deployment: process.env.PILOT_DEPLOYMENT_SHA ?? null,
  scope: "authenticated read-only POS dialog keyboard regression; no business writes",
  host,
  viewports: viewports.map(({ width }) => width),
  checks: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  failures,
  results,
};
const outputPath = path.join(root, "docs", "UAT_POS_DIALOG_2026-10-17.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, checks: results.length, passed: output.passed, failed: output.failed }));
if (failures.length) process.exitCode = 1;
