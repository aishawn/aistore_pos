import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.orithos.com.au:3000";
const browser = await chromium.launch({
  headless: true,
  args: ["--host-resolver-rules=MAP demo.orithos.com.au 127.0.0.1"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const transcriptions = [];
let assistantRequests = 0;
const unexpectedWrites = [];

await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
await context.addInitScript(() => {
  localStorage.setItem("sf_token", "local-uat-session");
  localStorage.setItem("sf_user", JSON.stringify({ id: "uat-admin", name: "UAT Admin", username: "admin", isAdmin: true }));

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
  if (request.method() !== "GET" && request.method() !== "HEAD" && request.method() !== "OPTIONS") {
    unexpectedWrites.push(`${request.method()} ${url.pathname}`);
    return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "Voice UAT blocked unexpected write" }) });
  }
  const data = url.pathname === "/api/ai/config/client"
    ? { enabled: true, assistantAvailable: true, transcriptionAvailable: true, aiTriggerKeywords: [] }
    : [];
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data }) });
});

let result;
try {
  await page.goto(`${base}/overview?__uat_voice=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const trigger = page.getByRole("button", { name: /Open Orithos AI/ }).first();
  await trigger.waitFor({ state: "visible", timeout: 30000 });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Orithos AI assistant" });
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  const composer = dialog.getByRole("textbox", { name: "Ask Orithos AI" });

  const holdButton = dialog.getByRole("button", { name: "Hold to speak" });
  await holdButton.waitFor({ state: "visible", timeout: 10000 });
  await holdButton.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "mouse", button: 0 });
  const releaseButton = dialog.getByRole("button", { name: "Release to stop voice input" });
  await releaseButton.waitFor({ state: "visible", timeout: 10000 });
  await releaseButton.dispatchEvent("pointerup", { pointerId: 1, pointerType: "mouse", button: 0 });
  await page.waitForFunction(() => document.querySelector('input[aria-label="Ask Orithos AI"]')?.value === "Fixture transcript", undefined, { timeout: 10000 });
  const releasedTranscribesOnce = transcriptions.length === 1;
  const transcriptIsNotAutoSubmitted = assistantRequests === 0;

  await composer.fill("");
  const holdAgain = dialog.getByRole("button", { name: "Hold to speak" });
  await holdAgain.dispatchEvent("pointerdown", { pointerId: 2, pointerType: "mouse", button: 0 });
  const releaseAgain = dialog.getByRole("button", { name: "Release to stop voice input" });
  await releaseAgain.waitFor({ state: "visible", timeout: 10000 });
  await releaseAgain.dispatchEvent("pointercancel", { pointerId: 2, pointerType: "mouse", button: 0 });
  await dialog.getByRole("button", { name: "Hold to speak" }).waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(300);
  const cancelDoesNotTranscribe = transcriptions.length === 1;
  const cancelLeavesComposerEmpty = await composer.inputValue() === "";
  const bothStreamsStopped = await page.evaluate(() => window.__uatStoppedTracks === 2);

  result = {
    releasedTranscribesOnce,
    transcriptIsNotAutoSubmitted,
    cancelDoesNotTranscribe,
    cancelLeavesComposerEmpty,
    bothStreamsStopped,
    assistantRequests,
    transcriptions,
    unexpectedWrites,
    pageErrors,
  };
} catch (error) {
  result = {
    releasedTranscribesOnce: false,
    transcriptIsNotAutoSubmitted: false,
    cancelDoesNotTranscribe: false,
    cancelLeavesComposerEmpty: false,
    bothStreamsStopped: false,
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
  && result.cancelDoesNotTranscribe
  && result.cancelLeavesComposerEmpty
  && result.bothStreamsStopped
  && result.assistantRequests === 0
  && result.unexpectedWrites.length === 0
  && result.pageErrors.length === 0;
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  worktreeChangesIncluded: true,
  target: base,
  scope: "fixture microphone; release transcribes once; pointercancel cancels without ASR or assistant submit; all APIs intercepted",
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
