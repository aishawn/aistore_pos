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
  const enabled = Boolean(config.body.data.enabled);
  record("AI client config", "PASS", `Loaded ${config.body.data.aiTriggerKeywords.length} trigger keywords; enabled=${enabled}.`);

  for (const endpoint of ["/api/ai/config/intents", "/api/ai/config/slots", "/api/ai/config/slot-values", "/api/ai/config/prompts"]) {
    const result = await jsonRequest(endpoint);
    if (!result.response.ok() || result.body.code !== 0 || !Array.isArray(result.body.data)) {
      record(`AI config ${endpoint.split("/").at(-1)}`, "FAIL", `${result.response.status()} ${result.body.message || ""}`);
      continue;
    }
    record(`AI config ${endpoint.split("/").at(-1)}`, "PASS", `Loaded ${result.body.data.length} records.`);
  }

  const assistant = await jsonRequest("/api/ai/assistant", "POST", { question: "look up product DEMO" });
  if (assistant.body.code === 50301 && !enabled) {
    record("AI assistant availability", "PASS", "Assistant is intentionally disabled because production AI_ENABLED is false.");
  } else if (!assistant.response.ok() || assistant.body.code !== 0 || !assistant.body.data?.threadId) {
    throw new Error(`AI_ASSISTANT_FAILED_${assistant.response.status()}_${assistant.body.message || ""}`);
  } else {
    record("AI assistant product lookup", "PASS", `Returned intent ${assistant.body.data.intent}.`);
  }

  const emptyAudio = await context.request.post(`${base}/api/ai/transcribe`, {
    multipart: { file: { name: "empty.webm", mimeType: "audio/webm", buffer: Buffer.alloc(0) } },
  });
  const emptyAudioBody = await emptyAudio.json().catch(() => ({}));
  if (emptyAudioBody.code === 50301 && !enabled) {
    record("Voice input availability", "PASS", "Cloud transcription is intentionally disabled because production AI_ENABLED is false.");
  } else if (![200, 400].includes(emptyAudio.status()) || emptyAudioBody.code !== 40010) {
    throw new Error(`EMPTY_AUDIO_GUARD_${emptyAudio.status()}_${emptyAudioBody.code ?? ""}`);
  } else {
    record("Voice input validation", "PASS", `Empty audio is rejected with code 40010 (HTTP ${emptyAudio.status()}).`);
  }

  const emptyImage = await context.request.post(`${base}/api/ai/sommelier/identify-image`, {
    multipart: { file: { name: "empty.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(0) } },
  });
  const emptyImageBody = await emptyImage.json().catch(() => ({}));
  if (emptyImageBody.code === 50301 && !enabled) {
    record("Label image availability", "PASS", "Cloud label recognition is intentionally disabled because production AI_ENABLED is false.");
  } else if (![200, 400].includes(emptyImage.status()) || emptyImageBody.code !== 40010) {
    throw new Error(`EMPTY_IMAGE_GUARD_${emptyImage.status()}_${emptyImageBody.code ?? ""}`);
  } else {
    record("Label image validation", "PASS", `Empty image is rejected with code 40010 (HTTP ${emptyImage.status()}).`);
  }

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
  const anonymousAiRoutes = [
    ["GET", "/api/ai/config/client"],
    ["GET", "/api/ai/config/intents"],
    ["GET", "/api/ai/config/slots"],
    ["GET", "/api/ai/config/slot-values"],
    ["GET", "/api/ai/config/prompts"],
    ["POST", "/api/ai/config/reload"],
    ["POST", "/api/ai/config/intents"],
    ["PUT", "/api/ai/config/intents/1"],
    ["DELETE", "/api/ai/config/intents/1"],
    ["POST", "/api/ai/config/slots"],
    ["PUT", "/api/ai/config/slots/1"],
    ["DELETE", "/api/ai/config/slots/1"],
    ["POST", "/api/ai/config/slot-values"],
    ["PUT", "/api/ai/config/slot-values/1"],
    ["DELETE", "/api/ai/config/slot-values/1"],
    ["POST", "/api/ai/config/prompts"],
    ["PUT", "/api/ai/config/prompts/1"],
    ["DELETE", "/api/ai/config/prompts/1"],
    ["POST", "/api/ai/transcribe"],
    ["POST", "/api/ai/sommelier/recommend"],
    ["GET", "/api/ai/sommelier/identify?q=DEMO"],
    ["POST", "/api/ai/sommelier/identify-image"],
    ["GET", "/api/ai/sommelier/wines/1"],
    ["POST", "/api/ai/sommelier/pitch"],
    ["POST", "/api/ai/sommelier/similar"],
    ["POST", "/api/ai/sommelier/ask"],
    ["POST", "/api/ai/sommelier/feedback"],
  ];
  for (const [method, route] of anonymousAiRoutes) {
    const response = await context.request.fetch(`${base}${route}`, {
      method,
      headers: { Origin: base },
      ...(method === "GET" || method === "DELETE" ? {} : { data: {} }),
    });
    if (response.status() !== 401) {
      throw new Error(`ANONYMOUS_AI_ROUTE_${method}_${route.replaceAll("/", "_")}_${response.status()}`);
    }
  }
  record("Anonymous AI route matrix", "PASS", `${anonymousAiRoutes.length} protected config, voice, label, and Sommelier routes returned HTTP 401; assistant and report were checked separately.`);
} catch (error) {
  record("AI surface regression", "FAIL", error instanceof Error ? error.message : "Unexpected failure");
} finally {
  try { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); } catch { /* session may already be logged out */ }
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  deployment: process.env.PILOT_DEPLOYMENT_VERIFIED === "true" && /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
    ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase()
    : "unverified-after-deploy",
  scope: "authenticated AI surface regression; no business, feedback, or AI configuration writes",
  checks,
  passed: checks.filter((check) => check.status === "PASS").length,
  failed: checks.filter((check) => check.status === "FAIL").length,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_SURFACE_2026-10-19_AUTHFIX.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: output.passed, failed: output.failed, checks }));
if (output.failed) process.exitCode = 2;
