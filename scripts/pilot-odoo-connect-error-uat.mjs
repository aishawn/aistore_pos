import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = "https://demo.orithos.com.au";
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
let mockLoginCalls = 0;
try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error("Orithos admin login failed");

  await page.route(`${base}/api/odoo/session`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: null, autoRecoverConfigured: true }) });
      return;
    }
    if (route.request().method() === "POST") {
      mockLoginCalls += 1;
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Mock Odoo login rejected" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: null, autoRecoverConfigured: true }) });
  });

  await page.goto(`${base}/settings/integrations`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: "Odoo point of sale" }).waitFor({ timeout: 20000 });
  await page.getByLabel("Odoo username").fill("mock-user");
  await page.getByLabel("Odoo password").fill("mock-only-password");
  await page.getByRole("button", { name: "Connect Odoo" }).click();
  const alert = page.locator('p[role="alert"]');
  await alert.getByText("Mock Odoo login rejected", { exact: true }).waitFor({ timeout: 10000 });
  const style = await alert.evaluate((element) => ({ background: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color }));
  if (!style.background.includes("249, 235, 235") && !style.background.includes("254, 242, 242")) {
    const className = await alert.getAttribute("class");
    if (!className?.includes("bg-red-50")) throw new Error(`Failure message is not styled as an error: ${JSON.stringify(style)}`);
  }
  if (mockLoginCalls !== 1) throw new Error(`Expected one intercepted Odoo login attempt, got ${mockLoginCalls}`);

  const output = {
    generatedAt: new Date().toISOString(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    deployment: process.env.PILOT_DEPLOYMENT_SHA || null,
    target: base,
    status: "PASS",
    scope: "connection failure presentation only; Odoo session API intercepted in browser, no Odoo credentials or requests sent",
    viewport: 390,
    checks: ["disconnected Odoo connection form renders", "mock 401 shows an accessible alert", "failure alert uses error styling", "only one intercepted login attempt occurred"],
    observed: { mockLoginCalls, alertRole: "alert", style },
  };
  const outputPath = path.join(root, "docs", "UAT_ODOO_CONNECT_ERROR_2026-10-14.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, status: output.status, checks: output.checks }));
} finally {
  try { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); } catch { /* Session expires normally. */ }
  await browser.close();
}
