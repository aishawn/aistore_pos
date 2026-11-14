import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3000";
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
await context.addCookies([
  { name: "orithos_access_token", value: "local-uat-session", url: base },
  { name: "orithos_local_preview", value: "1", url: base },
]);
await context.addInitScript(() => {
  localStorage.setItem("sf_token", "local-uat-session");
  localStorage.setItem("sf_user", JSON.stringify({ id: "uat-admin", name: "UAT Admin", username: "admin", isAdmin: true, vendorId: 1, outletId: 1, platformOperator: false }));
  if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {} });
  class FixtureMediaRecorder {
    static isTypeSupported() { return true; }
    constructor(_stream, options) { this.mimeType = options?.mimeType ?? "audio/webm"; this.state = "inactive"; }
    start() { this.state = "recording"; }
    stop() {
      if (this.state !== "recording") return;
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob([new Uint8Array(2048)], { type: this.mimeType }) });
      this.onstop?.();
    }
  }
  Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => ({ getTracks: () => [{ stop() {} }] }) });
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FixtureMediaRecorder });
  class FixtureAudioContext {
    state = "running"; sampleRate = 48000;
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() { return { fftSize: 1024, frequencyBinCount: 512, smoothingTimeConstant: 0, getFloatTimeDomainData(buffer) { buffer.fill(0.08); }, getByteFrequencyData(buffer) { buffer.fill(40); } }; }
    resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
  }
  Object.defineProperty(window, "AudioContext", { configurable: true, value: FixtureAudioContext });
});

const page = await context.newPage();
const pageErrors = [];
let assistantRequests = 0;
let transcribeRequests = 0;
await page.on("pageerror", (error) => pageErrors.push(error.message));
await page.route("**/api/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (request.method() === "POST" && url.pathname === "/api/ai/transcribe") {
    transcribeRequests += 1;
    return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ code: 50211, message: "Cloud transcription failed. Please try again.", data: null }) });
  }
  if (request.method() === "POST" && url.pathname === "/api/ai/assistant") {
    assistantRequests += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: { threadId: "voice-failure-fixture", intent: "unknown", answer: "No action", slots: {}, ui: null } }) });
  }
  const data = url.pathname === "/api/auth/me"
    ? { id: "uat-admin", name: "UAT Admin", username: "admin", isAdmin: true, vendorId: 1, outletId: 1, platformOperator: false }
    : url.pathname === "/api/ai/config/client"
    ? { enabled: true, assistantAvailable: true, transcriptionAvailable: true, aiTriggerKeywords: [] }
    : [];
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data }) });
});

let result;
try {
  await page.goto(`${base}/assistant?__uat_voice_failure=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const composer = page.getByRole("textbox", { name: "Ask Orithos AI" });
  const voiceButton = page.getByRole("button", { name: "Voice input" });
  await voiceButton.waitFor({ state: "visible", timeout: 30000 });
  await voiceButton.click();
  const stop = page.getByRole("button", { name: "Stop voice input" });
  await stop.waitFor({ state: "visible", timeout: 10000 });
  await stop.click();
  const alert = page.getByRole("alert").filter({ hasText: "Cloud transcription failed. Please try again." });
  await alert.waitFor({ state: "visible", timeout: 10000 });
  const message = await alert.textContent();
  result = {
    safeRetryMessage: /try again/i.test(message ?? ""),
    noTranscriptInserted: (await composer.inputValue()) === "",
    noAssistantSubmit: assistantRequests === 0,
    transcribeRequests,
    pageErrors,
  };
} catch (error) {
  result = { safeRetryMessage: false, noTranscriptInserted: false, noAssistantSubmit: false, transcribeRequests, pageErrors, failure: error instanceof Error ? error.message : "UNEXPECTED_FAILURE" };
} finally {
  await context.close();
  await browser.close();
}

const passed = result.safeRetryMessage && result.noTranscriptInserted && result.noAssistantSubmit && result.transcribeRequests === 1 && result.pageErrors.length === 0;
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  worktreeChangesIncluded: true,
  target: base,
  scope: "fixture cloud ASR failure; safe retry guidance; no transcript insertion or assistant submit",
  status: passed ? "PASS" : "FAIL",
  result,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH) : path.join(root, "docs", "UAT_AI_VOICE_FAILURE_LOCAL_2026-10-20.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, result }));
if (!passed) process.exitCode = 1;
