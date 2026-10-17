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
const base = "https://demo.orithos.com.au";
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const results = [];

async function runViewport(viewport) {
  const context = await browser.newContext({ viewport });
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${viewport.width}`);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`${base}/sommelier/find`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByRole("heading", { name: "Find a wine" }).waitFor({ timeout: 30000 });
  for (const label of ["Not sure", "No preference", "Not sure", "Full Body", "🍽 No food", "Dinner tonight"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    const next = page.getByRole("button", { name: label === "Dinner tonight" ? "Recommend" : "Continue", exact: true });
    if (label !== "Dinner tonight") {
      await next.click();
      await page.waitForTimeout(300);
    }
  }
  const recommendResponse = page.waitForResponse(
    (response) => response.request().method() === "POST"
      && response.url().includes("/api/ai/sommelier/recommend"),
    { timeout: 120000 },
  );
  await page.getByRole("button", { name: "Recommend", exact: true }).click();
  const recommendHttp = await recommendResponse;
  if (!recommendHttp.ok()) throw new Error(`RECOMMEND_HTTP_${recommendHttp.status()}`);
  await page.getByRole("heading", { name: "Orion Recommendation" }).waitFor({ timeout: 120000 });
  const recommendationCards = await page.locator("article").count();

  await page.goto(`${base}/sommelier/identify`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByPlaceholder("Penfolds Bin 28 or barcode").waitFor({ state: "visible", timeout: 30000 });
  const search = page.getByPlaceholder("Penfolds Bin 28 or barcode");
  await search.fill("DEMO");
  const identifyResponse = page.waitForResponse(
    (response) => response.request().method() === "GET"
      && response.url().includes("/api/ai/sommelier/identify?q=DEMO"),
    { timeout: 60000 },
  );
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const identifyHttp = await identifyResponse;
  if (!identifyHttp.ok()) throw new Error(`IDENTIFY_HTTP_${identifyHttp.status()}`);
  await page.waitForTimeout(500);
  const identifyItems = await page.locator("#main-content ul li").count();
  if (!identifyItems) throw new Error(`IDENTIFY_EMPTY_URL_${page.url()}_main=${identifyItems}_all=${await page.locator("ul li").count()}_${(await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 500)}`);
  await page.locator("#main-content ul li button").first().click();
  await page.getByRole("heading", { name: "How to sell" }).waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "10s", exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Similar but cheaper", exact: true }).click();
  await page.getByText(/cheaper|No cheaper/i).first().waitFor({ timeout: 60000 });

  // Overview exposes the floating assistant entry; the Sell home intentionally
  // hides the duplicate FAB because its in-page entry owns that surface.
  await page.goto(`${base}/overview`, { waitUntil: "networkidle", timeout: 60000 });
  const fab = page.getByRole("button", { name: /Open Orithos AI/ }).first();
  await fab.click();
  const assistant = page.getByRole("dialog", { name: "Orithos AI assistant" });
  await assistant.waitFor({ state: "visible", timeout: 10000 });
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press("Tab");
    const trapped = await assistant.evaluate((element) => element.contains(document.activeElement));
    if (!trapped) throw new Error(`AI_FOCUS_ESCAPED_TAB_${index + 1}_${viewport.width}`);
  }
  await page.keyboard.press("Escape");
  await assistant.waitFor({ state: "hidden", timeout: 10000 });
  const restoredFab = page.getByRole("button", { name: /Open Orithos AI/ }).first();
  const focusRestored = await restoredFab.evaluate((element) => document.activeElement === element);
  if (!focusRestored) throw new Error(`AI_FOCUS_NOT_RESTORED_${viewport.width}`);
  await restoredFab.click();
  const composer = page.getByPlaceholder("Ask Orithos AI…");
  await composer.fill("look up product DEMO");
  await composer.press("Enter");
  await page.getByText(/AI assistant is not enabled|could not connect/i).waitFor({ timeout: 60000 });
  results.push({ viewport: viewport.width, recommendationCards, identifyItems, pageErrors });
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } });
  await context.close();
}

try {
  await runViewport({ width: 390, height: 844 });
  await runViewport({ width: 1440, height: 900 });
} catch (error) {
  results.push({ failure: error instanceof Error ? error.message : "Unexpected failure" });
} finally {
  await browser.close();
}

const failures = results.filter((result) => result.failure || result.pageErrors?.length);
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  deployment: process.env.PILOT_DEPLOYMENT_SHA ?? "unverified-after-webhook",
  scope: "authenticated read-only AI UI regression; no sales, feedback, or configuration writes",
  checks: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  failures,
  results,
};
const outputPath = path.join(root, "docs", "UAT_AI_UI_2026-10-18.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, checks: output.checks, passed: output.passed, failed: output.failed, failures }));
if (output.failed) process.exitCode = 1;
