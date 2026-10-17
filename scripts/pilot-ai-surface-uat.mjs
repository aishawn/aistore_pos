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
const context = await browser.newContext();
const checks = [];
const record = (name, status, evidence) => checks.push({ name, status, evidence });

async function jsonRequest(pathname, method = "GET", data) {
  const response = method === "GET"
    ? await context.request.get(`${base}${pathname}`)
    : await context.request.post(`${base}${pathname}`, { data });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  const config = await jsonRequest("/api/ai/config/client");
  if (!config.response.ok() || config.body.code !== 0 || !Array.isArray(config.body.data?.aiTriggerKeywords)) {
    throw new Error(`AI_CLIENT_CONFIG_FAILED_${config.response.status()}`);
  }
  record("AI client config", "PASS", `Loaded ${config.body.data.aiTriggerKeywords.length} trigger keywords.`);

  for (const endpoint of ["/api/ai/config/intents", "/api/ai/config/slots", "/api/ai/config/slot-values", "/api/ai/config/prompts"]) {
    const result = await jsonRequest(endpoint);
    if (!result.response.ok() || result.body.code !== 0 || !Array.isArray(result.body.data)) {
      throw new Error(`${endpoint}_FAILED_${result.response.status()}_${result.body.message || ""}`);
    }
    record(`AI config ${endpoint.split("/").at(-1)}`, "PASS", `Loaded ${result.body.data.length} records.`);
  }

  const assistant = await jsonRequest("/api/ai/assistant", "POST", { question: "look up product DEMO" });
  if (!assistant.response.ok() || assistant.body.code !== 0 || !assistant.body.data?.threadId) {
    throw new Error(`AI_ASSISTANT_FAILED_${assistant.response.status()}_${assistant.body.message || ""}`);
  }
  record("AI assistant product lookup", "PASS", `Returned intent ${assistant.body.data.intent}.`);

  const emptyAudio = await context.request.post(`${base}/api/ai/transcribe`, {
    multipart: { file: { name: "empty.webm", mimeType: "audio/webm", buffer: Buffer.alloc(0) } },
  });
  const emptyAudioBody = await emptyAudio.json().catch(() => ({}));
  if (emptyAudio.status() !== 400 || emptyAudioBody.code !== 40010) {
    throw new Error(`EMPTY_AUDIO_GUARD_${emptyAudio.status()}_${emptyAudioBody.code ?? ""}`);
  }
  record("Voice input validation", "PASS", "Empty audio is rejected with HTTP 400 and code 40010.");

  const emptyImage = await context.request.post(`${base}/api/ai/sommelier/identify-image`, {
    multipart: { file: { name: "empty.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(0) } },
  });
  const emptyImageBody = await emptyImage.json().catch(() => ({}));
  if (emptyImage.status() !== 400 || emptyImageBody.code !== 40010) {
    throw new Error(`EMPTY_IMAGE_GUARD_${emptyImage.status()}_${emptyImageBody.code ?? ""}`);
  }
  record("Label image validation", "PASS", "Empty image is rejected with HTTP 400 and code 40010.");

  const logout = await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } });
  if (!logout.ok()) throw new Error(`LOGOUT_FAILED_${logout.status()}`);
  const deniedAssistant = await context.request.post(`${base}/api/ai/assistant`, {
    data: { question: "look up product DEMO" },
    headers: { Origin: base },
  });
  if (deniedAssistant.status() !== 401) throw new Error(`ANONYMOUS_ASSISTANT_${deniedAssistant.status()}`);
  record("Anonymous AI assistant guard", "PASS", "Assistant API returns HTTP 401 after logout.");

  const deniedReport = await context.request.get(`${base}/api/ai/reports/1`, { headers: { Origin: base } });
  if (deniedReport.status() !== 401) throw new Error(`ANONYMOUS_REPORT_${deniedReport.status()}`);
  record("Anonymous AI report guard", "PASS", "Report snapshot API returns HTTP 401 after logout.");
} catch (error) {
  record("AI surface regression", "FAIL", error instanceof Error ? error.message : "Unexpected failure");
} finally {
  try { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); } catch { /* session may already be logged out */ }
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  deployment: process.env.PILOT_DEPLOYMENT_SHA ?? "unverified-after-webhook",
  scope: "authenticated AI surface regression; no business, feedback, or AI configuration writes",
  checks,
  passed: checks.filter((check) => check.status === "PASS").length,
  failed: checks.filter((check) => check.status === "FAIL").length,
};
const outputPath = path.join(root, "docs", "UAT_AI_SURFACE_2026-10-18.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: output.passed, failed: output.failed, checks }));
if (output.failed) process.exitCode = 2;
