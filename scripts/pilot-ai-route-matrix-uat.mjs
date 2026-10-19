import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const routes = [
  "/overview",
  "/settings/users",
  "/purchases/odoo",
  "/stock/replenishment",
  "/sommelier",
  "/sommelier/find",
  "/sommelier/identify",
  "/invoices/scan",
  "/stock/stocktake",
];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const checks = [];

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password }, headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("sf_token", token);
    localStorage.setItem("sf_user", JSON.stringify(user));
  }, { token: accessCookie?.value, user: loginBody.data.user });

  for (const pathname of routes) {
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    try {
      const response = await page.goto(`${base}${pathname}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      const fab = page.getByRole("button", { name: /Open Orithos AI/ }).first();
      await fab.waitFor({ state: "visible", timeout: 30000 });
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth }));
      const result = { pathname, httpStatus: response?.status() ?? 0, aiFab: true, horizontalOverflow: layout.scrollWidth > layout.width, pageErrors };
      if (pathname === "/sommelier/identify") {
        // AI availability loads after the page shell; wait for the disabled state
        // before asserting the label-photo control.
        await page.getByText("Label photos need AI turned on. Name and barcode search still work.", { exact: true })
          .waitFor({ state: "visible", timeout: 15000 });
        const camera = page.getByRole("button", { name: "Photograph label", exact: true });
        result.labelPhotoButtonDisabled = await camera.isDisabled();
        result.disabledCopy = await page.getByText("Label photos need AI turned on. Name and barcode search still work.", { exact: true }).count() > 0;
      }
      checks.push({ name: pathname, status: result.aiFab && !result.horizontalOverflow && result.pageErrors.length === 0
        && (pathname !== "/sommelier/identify" || (result.labelPhotoButtonDisabled && result.disabledCopy)) ? "PASS" : "FAIL", evidence: result });
    } catch (error) {
      checks.push({ name: pathname, status: "FAIL", evidence: { error: error instanceof Error ? error.message : "Unexpected failure", pageErrors } });
    } finally {
      await page.close();
    }
  }
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } });
} catch (error) {
  checks.push({ name: "route matrix setup", status: "FAIL", evidence: error instanceof Error ? error.message : "Unexpected failure" });
} finally {
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  deployment: /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "") ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase() : "unverified-after-deploy",
  target: base,
  scope: "authenticated AI entry-point and disabled label-photo route matrix; no business writes",
  checks,
  passed: checks.filter((check) => check.status === "PASS").length,
  failed: checks.filter((check) => check.status === "FAIL").length,
  status: checks.length > 0 && checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL",
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_ROUTE_MATRIX_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: output.passed, failed: output.failed }));
if (output.status !== "PASS") process.exitCode = 1;
