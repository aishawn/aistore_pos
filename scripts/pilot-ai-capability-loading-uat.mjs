import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
const sourceCommit = process.env.PILOT_SOURCE_COMMIT
  ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const checks = [];
const record = (name, status, detail) => checks.push({ name, status, detail });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
    timeout: 60000,
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  for (const test of [
    { name: "Identify", route: "/sommelier/identify", button: "Photograph label", heading: "Identify a wine" },
    { name: "Invoice", route: "/invoices/new", button: "Photograph or upload", heading: "Scan supplier invoice" },
  ]) {
    const page = await context.newPage();
    let configSeen = false;
    let configStatus = null;
    let configBody = null;
    let configStarted;
    const configRequestStarted = new Promise((resolve) => { configStarted = resolve; });
    let releaseConfig;
    const configResponseGate = new Promise((resolve) => { releaseConfig = resolve; });
    await page.route("**/api/ai/config/client", async (route) => {
      configSeen = true;
      configStarted();
      await configResponseGate;
      const response = await route.fetch();
      configStatus = response.status();
      configBody = await response.json().catch(() => null);
      await route.fulfill({ response });
    });
    await page.goto(`${base}${test.route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: test.heading }).waitFor({ timeout: 30000 });
    const button = page.getByRole("button", { name: test.button });
    await button.waitFor({ timeout: 30000 });
    await configRequestStarted;
    const disabledWhileUnknown = await button.isDisabled();
    releaseConfig();
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")]
        .find((element) => /Photograph label|Photograph or upload/.test(element.textContent ?? ""));
      return button instanceof HTMLButtonElement && !button.disabled;
    }, undefined, { timeout: 30000 }).catch(() => {});
    const enabledAfterConfig = await button.isEnabled();
    record(`${test.name} gate while capability loads`, disabledWhileUnknown && configSeen ? "PASS" : "FAIL", `disabled=${disabledWhileUnknown} configSeen=${configSeen}`);
    record(`${test.name} gate after capability loads`, enabledAfterConfig ? "PASS" : "FAIL", `enabled=${enabledAfterConfig} status=${configStatus} client=${JSON.stringify(configBody?.data ?? configBody)}`);
    await page.close();
  }
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await context.close();
} finally {
  await browser.close();
}

const evidence = {
  generatedAt: new Date().toISOString(),
  sourceCommit,
  deploymentSha: /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
    ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase()
    : "unverified",
  target: base,
  scope: "read-only capability-loading gate regression; no image/model or business writes",
  status: checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL",
  checks,
  writes: [],
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", `UAT_AI_CAPABILITY_LOADING_ONLINE_${sourceCommit.slice(0, 7).toUpperCase()}.json`);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
if (evidence.status !== "PASS") process.exitCode = 1;
