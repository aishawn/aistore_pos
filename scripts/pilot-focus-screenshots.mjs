import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au";
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const routes = ["/reports/closures", "/platform/stores", "/utilities/future-costs", "/utilities/future-prices"];
const viewports = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const outputDir = process.env.PILOT_SCREENSHOT_DIR
  ? path.resolve(root, process.env.PILOT_SCREENSHOT_DIR)
  : path.join(root, "docs", "screenshots", "2026-10-17-report-batch");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const captures = [];
for (const viewport of viewports) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  for (const route of routes) {
    const target = route.startsWith("/platform/") ? "https://app.orithos.com.au" : base;
    const login = await context.request.post(`${target}/api/auth/login`, {
      data: { username: "admin", password },
      headers: { Origin: target },
    });
    const loginBody = await login.json().catch(() => ({}));
    if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${target}_${login.status()}`);
    const response = await page.goto(`${target}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);
    const slug = route.slice(1).replaceAll("/", "-");
    const file = `${slug || "home"}-${viewport.width}.png`;
    await page.screenshot({ path: path.join(outputDir, file), fullPage: true });
    captures.push({ route, target, viewport: viewport.width, status: response?.status() ?? 0, title: await page.title(), heading: await page.locator("h1").first().textContent().catch(() => null), screenshot: path.relative(root, path.join(outputDir, file)).replaceAll(path.sep, "/") });
  }
  await page.close();
  await context.close();
}
await browser.close();
const output = { generatedAt: new Date().toISOString(), target: base, routes, viewports: viewports.map(({ width }) => width), captures };
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_FOCUS_SCREENSHOTS_2026-10-17.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, captures: captures.length }));
