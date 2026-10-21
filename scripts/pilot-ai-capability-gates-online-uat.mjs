/**
 * Online read-only capability gate regression.
 * The real config response is modified only in the browser to simulate a
 * transcription outage while keeping the authenticated chat capability on.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au";
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const writes = [];
const pageErrors = [];
try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  const cookie = (await context.cookies(base)).find((item) => item.name === "orithos_access_token");
  if (!cookie) throw new Error("LOGIN_SESSION_NOT_AVAILABLE");
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("sf_token", token);
    localStorage.setItem("sf_user", JSON.stringify(user));
  }, { token: cookie.value, user: loginBody.data.user });

  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      writes.push(`${request.method()} ${url.pathname}`);
    }
  });
  await page.route("**/api/ai/config/client", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const data = { ...(body.data ?? {}), enabled: true, assistantAvailable: true, transcriptionAvailable: false };
    await route.fulfill({ response, contentType: "application/json", body: JSON.stringify({ ...body, data }) });
  });
  await page.goto(`${base}/overview?__uat_capability_gate=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const trigger = page.getByRole("button", { name: /Open Orithos AI/ }).first();
  await trigger.waitFor({ state: "visible", timeout: 30000 });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Orithos AI assistant" });
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  const composer = dialog.getByPlaceholder("Ask Orithos AI…");
  const voice = dialog.getByRole("button", { name: "Voice input" });
  await composer.waitFor({ state: "visible", timeout: 10000 });
  await page.locator('button[title="Voice transcription is unavailable for this store"]')
    .waitFor({ state: "visible", timeout: 15000 });
  const result = {
    chatEnabled: !(await composer.isDisabled()),
    voiceDisabled: await voice.isDisabled(),
    voiceTitle: await voice.getAttribute("title"),
    pageErrors,
    writes,
  };
  const status = result.chatEnabled
    && result.voiceDisabled
    && result.voiceTitle === "Voice transcription is unavailable for this store"
    && result.pageErrors.length === 0
    && result.writes.length === 0
    ? "PASS"
    : "FAIL";
  const output = {
    generatedAt: new Date().toISOString(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    deployment: process.env.PILOT_DEPLOYMENT_SHA ?? "unverified-after-deploy",
    target: base,
    scope: "online browser fault injection for transcription capability; no business writes",
    status,
    checks: [result],
  };
  const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
    ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
    : path.join(root, "docs", "UAT_AI_CAPABILITY_GATES_ONLINE_2026-10-19.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
  console.log(JSON.stringify({ outputPath, status, result }));
  if (status !== "PASS") process.exitCode = 1;
} finally {
  try { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); } catch { /* session may expire */ }
  await context.close();
  await browser.close();
}
