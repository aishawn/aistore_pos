/**
 * Verifies that AI sub-capabilities are independently reflected in the POS UI.
 * The fixture keeps chat available while cloud transcription is unavailable;
 * opening the assistant must not expose an active microphone or send a request.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
const browser = await chromium.launch({ headless: true });
const results = [];
let transcriptionRequests = 0;
let assistantRequests = 0;
const interceptedWrites = [];

async function runViewport(viewport, assistantAvailable) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
  await context.addInitScript(() => {
    localStorage.setItem("sf_token", "local-uat-session");
    localStorage.setItem("sf_user", JSON.stringify({ id: "uat-admin", name: "UAT Admin", username: "admin", isAdmin: true }));
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/ai/transcribe") transcriptionRequests += 1;
    if (url.pathname === "/api/ai/assistant") assistantRequests += 1;
    if (url.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      interceptedWrites.push(request.method() + " " + url.pathname);
    }
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET") {
      return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "Local UAT blocks API writes", data: null }) });
    }
    const data = url.pathname === "/api/ai/config/client"
      ? {
        enabled: true,
        assistantAvailable,
        transcriptionAvailable: false,
        labelVisionAvailable: true,
        invoiceVisionAvailable: true,
        aiTriggerKeywords: [],
      }
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data }) });
  });

  try {
    await page.goto(`${base}/overview?__uat_capability_gate=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const trigger = page.getByRole("button", { name: /Open Orithos AI/ }).first();
    await trigger.waitFor({ state: "visible", timeout: 30000 });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Orithos AI assistant" });
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    const composer = dialog.getByPlaceholder(/Ask Orithos AI|AI chat is off for this store/);
    await composer.waitFor({ state: "visible", timeout: 10000 });
    const chatDisabled = await composer.isDisabled();
    const voice = dialog.getByRole("button", { name: "Voice input" });
    const voiceDisabled = await voice.isDisabled();
    const voiceTitle = await voice.getAttribute("title");
    if (assistantAvailable) {
      await composer.fill("Today's sales");
      await composer.fill("");
    } else {
      await dialog.getByText("AI chat is off for this store. The shortcuts below still open the right page.").waitFor({ timeout: 10000 });
    }
    results.push({
      viewport: viewport.width,
      expectedChatAvailable: assistantAvailable,
      expectedVoiceTitle: assistantAvailable
        ? "Voice transcription is unavailable for this store"
        : "Voice input is disabled for this store",
      chatDisabled,
      voiceDisabled,
      voiceTitle,
      pageErrors,
    });
  } finally {
    await context.close();
  }
}

try {
  await runViewport({ width: 390, height: 844 }, true);
  await runViewport({ width: 390, height: 844 }, false);
  await runViewport({ width: 1440, height: 900 }, true);
  await runViewport({ width: 1440, height: 900 }, false);
} finally {
  await browser.close();
}

const failures = results.filter((result) =>
  result.chatDisabled === result.expectedChatAvailable
  || !result.voiceDisabled
  || result.voiceTitle !== result.expectedVoiceTitle
  || result.pageErrors.length > 0,
);
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  environment: "local-dev-fixtures",
  target: base,
  scope: "AI capability gate UI; chat on/off and voice unavailable at 390/1440; all API writes intercepted",
  status: failures.length === 0 && transcriptionRequests === 0 && assistantRequests === 0 && interceptedWrites.length === 0 ? "PASS" : "FAIL",
  checks: results,
  assistantRequests,
  transcriptionRequests,
  interceptedWrites,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_CAPABILITY_GATES_LOCAL_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ outputPath, status: output.status, checks: results, transcriptionRequests, interceptedWrites }));
if (output.status !== "PASS") process.exitCode = 1;
