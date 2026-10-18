import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const password = env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const base = "https://demo.orithos.com.au";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const writes = [];
let injected = false;
let permissionRequests = 0;

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
  });
  const body = await login.json().catch(() => ({}));
  if (!login.ok() || body.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  const page = await context.newPage();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") && request.method() !== "GET" && !url.pathname.startsWith("/api/auth/")) {
      writes.push(`${request.method()} ${url.pathname}`);
    }
  });
  await page.route("**/api/roles/*/permissions", async (route) => {
    if (!injected && route.request().method() === "GET") {
      injected = true;
      permissionRequests += 1;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Injected role permission failure" }) });
      return;
    }
    if (route.request().method() === "GET") permissionRequests += 1;
    await route.continue();
  });

  await page.goto(`${base}/settings/roles`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: "Roles & Permissions", exact: true }).waitFor({ timeout: 30000 });
  const failedCopy = page.getByText("Could not load permissions", { exact: true }).first();
  await failedCopy.waitFor({ state: "visible", timeout: 30000 });
  const retry = page.getByRole("button", { name: "Retry permissions", exact: true }).first();
  await retry.waitFor({ state: "visible", timeout: 10000 });
  await retry.click();
  await failedCopy.waitFor({ state: "hidden", timeout: 30000 });

  const result = {
    generatedAt: new Date().toISOString(),
    sourceCommit: "unverified-after-deploy",
    deployment: "unverified-after-deploy",
    target: base,
    path: "/settings/roles",
    scope: "read-only injected 503 recovery for role permission lookup; no business writes",
    injected,
    permissionRequests,
    recovered: true,
    writes,
    status: writes.length === 0 && injected ? "PASS" : "FAIL",
  };
  const outputPath = path.join(root, "docs", "UAT_ROLE_PERMISSION_RETRY_2026-10-18.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, status: result.status, permissionRequests, writes: writes.length }));
  if (result.status !== "PASS") process.exitCode = 1;
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await browser.close();
}
