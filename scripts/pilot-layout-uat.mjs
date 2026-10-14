import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
const base = "https://app.orithos.com.au";
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const deployment = process.env.PILOT_DEPLOYMENT_SHA || null;
const pageMatrixName = process.env.PILOT_PAGE_MATRIX_FILENAME || "UAT_PAGE_MATRIX_2026-10-13.json";
const pages = JSON.parse(fs.readFileSync(path.join(root, "docs", pageMatrixName), "utf8")).matrix.map((entry) => entry.path);
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");
const browser = await chromium.launch({ headless: true });
const results = [];
async function retryTransient(operation, label) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return { value: await operation(), retries: attempt - 1 };
    } catch (error) {
      const transient = /timeout|timed out|ERR_TIMED_OUT|ECONNRESET|ERR_CONNECTION_RESET/i.test(String(error));
      if (!transient || attempt === 3) throw new Error(`${label} failed after ${attempt} attempt(s): ${String(error)}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw new Error(`${label} failed without a result`);
}
for (const width of [390, 1440]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const { value: login } = await retryTransient(
    () => context.request.post(`${base}/api/auth/login`, { data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD }, headers: { Origin: base }, timeout: 30000 }),
    `login at ${width}px`,
  );
  const body = await login.json().catch(() => ({}));
  if (!login.ok() || body.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  const page = await context.newPage();
  for (const route of pages) {
    const { retries } = await retryTransient(
      () => page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 }),
      `${route} at ${width}px`,
    );
    await page.waitForTimeout(700);
    const metrics = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, heading: document.querySelector("h1") ? getComputedStyle(document.querySelector("h1")).fontSize : null }));
    results.push({ width, route, ...metrics, retries, status: metrics.document <= width ? "PASS" : "OVERFLOW" });
  }
  await context.close();
}
await browser.close();
const failed = results.filter((item) => item.status !== "PASS");
const output = { generatedAt: new Date().toISOString(), deployment, sourceCommit, target: base, pagesChecked: pages.length, viewportWidths: [390, 1440], checks: results.length, passed: results.length - failed.length, failed: failed.length, results };
const outputName = process.env.PILOT_UAT_FILENAME || "UAT_LAYOUT_2026-10-14.json";
const outputPath = path.join(root, "docs", outputName);
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ outputPath, pagesChecked: pages.length, checks: results.length, passed: output.passed, failed, details: failed }));
if (failed.length) process.exitCode = 1;
