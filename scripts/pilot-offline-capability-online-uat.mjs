/**
 * Verifies the customer-facing offline boundary without claiming offline sales support.
 * Browser network emulation is used; no business writes are made.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const localEnv = fs.existsSync(envPath)
  ? Object.fromEntries(fs.readFileSync(envPath, "utf8").split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }))
  : {};
const base = (process.env.PILOT_BASE_URL || "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD || localEnv.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
let result;
try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.getByTestId("sh-current-user").click();
  const menu = page.getByRole("dialog", { name: "User menu" });
  await menu.waitFor({ state: "visible", timeout: 30000 });
  const onlineText = await menu.innerText();
  const onlineBoundary = onlineText.includes("ONLINE")
    && onlineText.includes("Offline POS checkout is not supported");

  await context.setOffline(true);
  await page.waitForTimeout(250);
  const offlineText = await menu.innerText();
  const offlineBoundary = offlineText.includes("OFFLINE")
    && offlineText.includes("Offline POS checkout is not supported");
  await context.setOffline(false);

  result = {
    generatedAt: new Date().toISOString(),
    target: base,
    runtimeVerifiedAgainst: process.env.PILOT_DEPLOYMENT_SHA || "unverified",
    scope: "browser network emulation only; no sale, payment, or Odoo writes",
    checks: {
      onlineBoundary,
      offlineBoundary,
      offlineSalesSupported: false,
    },
    status: onlineBoundary && offlineBoundary ? "PASS" : "FAIL",
    businessWrites: 0,
  };
} catch (error) {
  result = {
    generatedAt: new Date().toISOString(),
    target: base,
    runtimeVerifiedAgainst: process.env.PILOT_DEPLOYMENT_SHA || "unverified",
    scope: "browser network emulation only; no sale, payment, or Odoo writes",
    status: "BLOCKED",
    detail: String(error instanceof Error ? error.message : "Unexpected error").replace(/(cookie|authorization|password):[^\r\n]*/gi, "$1: [redacted]"),
    businessWrites: 0,
  };
} finally {
  await browser.close();
}

const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_OFFLINE_CAPABILITY_ONLINE.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: result.status, checks: result.checks ?? null }));
if (result.status !== "PASS") process.exitCode = result.status === "BLOCKED" ? 2 : 1;
