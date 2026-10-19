import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");
const checks = [];
const blockedWrites = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password, subdomain: process.env.PILOT_SUBDOMAIN ?? env.PILOT_SUBDOMAIN ?? "demo" },
    headers: { Origin: base, "X-Orithos-Tenant-Slug": process.env.PILOT_SUBDOMAIN ?? env.PILOT_SUBDOMAIN ?? "demo" },
    timeout: 60000,
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const page = await context.newPage({ viewport });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        blockedWrites.push(`${request.method()} ${new URL(request.url()).pathname}`);
        return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "Read-only UAT blocked this request", data: null }) });
      }
      return route.continue();
    });
    const response = await page.goto(`${base}/utilities/vendor-connections`, { waitUntil: "domcontentloaded", timeout: 90000 });
    const heading = page.getByRole("heading", { name: "Vendor Connections", exact: true });
    await heading.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1800);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    const mobileList = page.getByRole("list", { name: "Vendor connections list" });
    const desktopTable = page.getByRole("table");
    const hasVendor = await page.getByText(/vendor/i).count() > 0;
    const result = {
      viewport: viewport.width,
      httpStatus: response?.status() ?? 0,
      headingVisible: await heading.isVisible().catch(() => false),
      mobileListVisible: viewport.width === 390 ? (await mobileList.count() > 0 ? await mobileList.isVisible().catch(() => false) : null) : null,
      desktopTableVisible: viewport.width === 1440 ? (await desktopTable.count() > 0 ? await desktopTable.isVisible().catch(() => false) : null) : null,
      hasVendorText: hasVendor,
      noHorizontalOverflow: dimensions.width <= dimensions.viewport + 1,
      pageErrors,
    };
    result.pass = result.httpStatus === 200 && result.headingVisible && result.hasVendorText && result.noHorizontalOverflow && !result.pageErrors.length && (result.mobileListVisible !== false) && (result.desktopTableVisible !== false);
    checks.push(result);
    await page.close();
  }
} finally {
  await browser.close();
}

const failures = checks.filter((check) => !check.pass);
const output = {
  generatedAt: new Date().toISOString(),
  target: base,
  sourceCommit: process.env.PILOT_SOURCE_COMMIT ?? null,
  deployment: "unverified-after-deploy",
  scope: "authenticated Vendor Connections responsive read-only regression",
  status: failures.length === 0 && blockedWrites.length === 0 ? "PASS" : "FAIL",
  passed: checks.length - failures.length,
  failed: failures.length,
  checks,
  blockedWrites,
};
const filename = process.env.PILOT_UAT_FILENAME ?? "docs/UAT_VENDOR_CONNECTIONS_ONLINE_2026-10-20.json";
const outputPath = path.isAbsolute(filename) ? filename : path.join(root, filename);
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: output.passed, failed: output.failed, blockedWrites: blockedWrites.length }));
if (failures.length || blockedWrites.length) process.exitCode = 1;
