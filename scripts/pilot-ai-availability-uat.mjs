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
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const checks = [];
const record = (name, status, evidence) => checks.push({ name, status, evidence });

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
  if (!accessCookie || !loginBody.data?.user) throw new Error("LOGIN_SESSION_NOT_AVAILABLE_TO_BROWSER");
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("sf_token", token);
    localStorage.setItem("sf_user", JSON.stringify(user));
  }, { token: accessCookie.value, user: loginBody.data.user });

  const configResponse = await context.request.get(`${base}/api/ai/config/client`);
  const configBody = await configResponse.json().catch(() => ({}));
  if (!configResponse.ok() || configBody.code !== 0 || typeof configBody.data?.enabled !== "boolean") {
    throw new Error(`AI_ENABLED_FLAG_${configResponse.status()}_${String(configBody.data?.enabled)}`);
  }
  const enabled = configBody.data.enabled;
  record("AI availability config", "PASS", `Authenticated client config reports enabled=${enabled}.`);

  const page = await context.newPage();
  // This is a Next/SPA surface; third-party telemetry can keep networkidle
  // open indefinitely even after the assistant is interactive.
  await page.goto(`${base}/overview`, { waitUntil: "commit", timeout: 60000 });
  await page.locator('main[aria-busy="false"]').waitFor({ timeout: 60000 }).catch(() => {});
  const fab = page.getByRole("button", { name: /Open Orithos AI/ }).first();
  await fab.click();
  const dialog = page.getByRole("dialog", { name: "Orithos AI assistant" });
  await dialog.waitFor({ state: "visible", timeout: 15000 });
  if (enabled) {
    const composer = dialog.getByPlaceholder("Ask Orithos AI…");
    await composer.waitFor({ state: "visible", timeout: 15000 });
    if (await composer.isDisabled()) throw new Error("AI_COMPOSER_DISABLED_WHILE_STORE_AI_ENABLED");
    record("Enabled AI composer", "PASS", "Assistant composer is enabled while store AI is on; no prompt was submitted by this check.");
  } else {
    await dialog.getByText("AI is disabled for this store", { exact: true }).waitFor({ timeout: 15000 });
    await dialog.getByText("AI chat is off for this store. The shortcuts below still open the right page.").waitFor({ timeout: 15000 });
    const composer = dialog.getByPlaceholder("AI chat is off for this store");
    await composer.waitFor({ state: "visible", timeout: 15000 });
    if (await composer.isEnabled()) throw new Error("AI_COMPOSER_ENABLED_WHILE_STORE_AI_DISABLED");
    record("Disabled AI status copy", "PASS", "Assistant header and composer explain that production AI chat is off before a request is sent.");
  }

  // The current assistant exposes sell-adjacent navigation through its shared
  // Quick actions rather than the retired “Open sell” button.
  await dialog.getByRole("button", { name: "Products", exact: true }).click();
  // With AI enabled the shortcut first offers a safe CTA in the conversation;
  // disabled-chat mode may navigate immediately. Accept either product path.
  const productsCta = dialog.getByRole("button", { name: "Open products", exact: true });
  try {
    await productsCta.waitFor({ state: "visible", timeout: 5000 });
    await productsCta.click();
  } catch {
    // Direct navigation already happened, so there is no CTA to click.
  }
  await page.waitForURL((url) => url.pathname === "/products", { timeout: 15000, waitUntil: "commit" });
  record("Quick action remains available", "PASS", "The Products shortcut navigated without an AI or business write request.");
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } });
} catch (error) {
  record("AI availability UI regression", "FAIL", error instanceof Error ? error.message : "Unexpected failure");
} finally {
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  deployment: process.env.PILOT_DEPLOYMENT_VERIFIED === "true" && /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
    ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase()
    : "unverified-after-deploy",
  scope: "authenticated AI availability UI and local shortcut; no business writes",
  checks,
  passed: checks.filter((check) => check.status === "PASS").length,
  failed: checks.filter((check) => check.status === "FAIL").length,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_AVAILABILITY_2026-10-19_AUTHFIX.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: output.passed, failed: output.failed, checks }));
if (output.failed) process.exitCode = 1;
