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
  viewport: { width: 1440, height: 900 },
});
const transcriptions = [];
let assistantRequests = 0;
const unexpectedWrites = [];

await context.addCookies([
  { name: "orithos_access_token", value: "local-uat-session", url: base },
  { name: "orithos_local_preview", value: "1", url: base },
]);
await context.addInitScript(() => {
  localStorage.setItem("sf_token", "local-uat-session");
  localStorage.setItem("sf_user", JSON.stringify({ id: "uat-admin", name: "UAT Admin", username: "admin", isAdmin: true, vendorId: 1, outletId: 1, platformOperator: false }));
  if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {} });

  window.__uatStoppedTracks = 0;
  Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
    configurable: true,
    value: async () => ({
      getTracks: () => [{ stop: () => { window.__uatStoppedTracks += 1; } }],
    }),
  });

  class FixtureMediaRecorder {
    static isTypeSupported() { return true; }
    constructor(_stream, options) {
      this.mimeType = options?.mimeType ?? "audio/webm";
      this.state = "inactive";
      this.ondataavailable = null;
      this.onstop = null;
      this.onerror = null;
    }
    start() { this.state = "recording"; }
    stop() {
      if (this.state !== "recording") return;
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob([new Uint8Array(2048)], { type: this.mimeType }) });
      this.onstop?.();
    }
  }
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FixtureMediaRecorder });

  class FixtureAudioContext {
    state = "running";
    sampleRate = 48000;
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() {
      return {
        fftSize: 1024,
        frequencyBinCount: 512,
        smoothingTimeConstant: 0,
        getFloatTimeDomainData(buffer) { buffer.fill(0.08); },
        getByteFrequencyData(buffer) { buffer.fill(40); },
      };
    }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  Object.defineProperty(window, "AudioContext", { configurable: true, value: FixtureAudioContext });
});

const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.route("**/api/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (request.method() === "POST" && url.pathname === "/api/ai/transcribe") {
    transcriptions.push({ method: request.method(), path: url.pathname });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 0, message: "OK", data: { text: "Fixture transcript", lang: "en" } }),
    });
  }
  if (request.method() === "POST" && url.pathname === "/api/ai/assistant") {
    assistantRequests += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      code: 0,
      message: "OK",
      data: { threadId: "voice-fixture", intent: "unknown", intentSummary: "Fixture", answer: "No action", slots: {}, ui: null },
    }) });
  }
  if (request.method() !== "GET" && request.method() !== "HEAD" && request.method() !== "OPTIONS" && url.pathname !== "/api/auth/refresh") {
    unexpectedWrites.push(`${request.method()} ${url.pathname}`);
    return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "Voice UAT blocked unexpected write" }) });
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
  await page.goto(`${base}/assistant?__uat_voice=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const composer = page.getByRole("textbox", { name: "Ask Orithos AI" });

  const voiceButton = page.getByRole("button", { name: "Voice input" });
  await voiceButton.waitFor({ state: "visible", timeout: 30000 });
  await voiceButton.click();
  const stopButton = page.getByRole("button", { name: "Stop voice input" });
  await stopButton.waitFor({ state: "visible", timeout: 10000 });
  await stopButton.click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Ask Orithos AI"]')?.value === "Fixture transcript", undefined, { timeout: 10000 });
  const releasedTranscribesOnce = transcriptions.length === 1;
  const transcriptIsNotAutoSubmitted = assistantRequests === 0;
  const recordingTrackStopped = await page.evaluate(() => window.__uatStoppedTracks === 1);

  result = {
    releasedTranscribesOnce,
    transcriptIsNotAutoSubmitted,
    recordingTrackStopped,
    transcriptVisibleInComposer: await composer.inputValue() === "Fixture transcript",
    assistantRequests,
    transcriptions,
    unexpectedWrites,
    pageErrors,
  };
} catch (error) {
  result = {
    releasedTranscribesOnce: false,
    transcriptIsNotAutoSubmitted: false,
    recordingTrackStopped: false,
    transcriptVisibleInComposer: false,
    assistantRequests,
    transcriptions,
    unexpectedWrites,
    pageErrors,
    failure: error instanceof Error ? error.message : "UNEXPECTED_FAILURE",
  };
} finally {
  await context.close();
  await browser.close();
}

const passed = result.releasedTranscribesOnce
  && result.transcriptIsNotAutoSubmitted
  && result.recordingTrackStopped
  && result.transcriptVisibleInComposer
  && result.assistantRequests === 0
  && result.unexpectedWrites.length === 0
  && result.pageErrors.length === 0;
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  worktreeChangesIncluded: true,
  target: base,
  scope: "fixture microphone; click-to-start/stop records once, inserts transcript without assistant submit; all APIs intercepted",
  status: passed ? "PASS" : "FAIL",
  result,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_VOICE_LOCAL.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, result }));
if (!passed) process.exitCode = 1;
