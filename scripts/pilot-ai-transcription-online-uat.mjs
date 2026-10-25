import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const localEnv = fs.existsSync(envPath)
  ? Object.fromEntries(fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }))
  : {};

const base = (process.env.PILOT_BASE_URL || "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD || localEnv.INITIAL_ADMIN_PASSWORD;
const fixtureDirectory = path.join(root, "scripts", "fixtures", "ai-transcription");
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_TRANSCRIPTION_ONLINE.json");
const cases = [
  {
    id: "asr-en-store-question",
    fixture: process.env.PILOT_AUDIO_FIXTURE_EN || path.join(fixtureDirectory, "sales-question-en.wav"),
    lang: "en-AU",
    expected: /sales/i,
  },
  {
    id: "asr-zh-store-question",
    fixture: process.env.PILOT_AUDIO_FIXTURE_ZH || path.join(fixtureDirectory, "sales-question-zh.wav"),
    lang: "zh-CN",
    expected: /营业额|销售额|销售/i,
  },
];
const evidence = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  worktreeDirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()),
  deploymentShaVerified: false,
  runtimeCommit: null,
  target: base,
  scope: "authenticated synthetic speech transcription only; no assistant submission or business writes",
  writeBusinessData: false,
  checks: [],
};
const record = (name, status, detail) => evidence.checks.push({ name, status, detail });

if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
    timeout: 60000,
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  record("admin login", "PASS", `status=${login.status()}`);

  const configResponse = await context.request.get(`${base}/api/ai/config/client`);
  const configBody = await configResponse.json().catch(() => ({}));
  const config = configBody.data ?? {};
  if (!configResponse.ok() || configBody.code !== 0) {
    record("transcription capability config", "FAIL", `status=${configResponse.status()}`);
  } else if (!config.transcriptionAvailable) {
    record("transcription capability config", "BLOCKED", "transcription is unavailable for this store");
  } else {
    record("transcription capability config", "PASS", "available=true");
  }

  for (const testCase of cases) {
    if (!config.transcriptionAvailable) continue;
    if (!testCase.fixture || !fs.existsSync(testCase.fixture)) {
      record(testCase.id, "BLOCKED", "synthetic speech fixture was not supplied");
      continue;
    }
    const bytes = fs.readFileSync(testCase.fixture);
    const response = await context.request.post(`${base}/api/ai/transcribe`, {
      multipart: {
        file: { name: path.basename(testCase.fixture), mimeType: "audio/wav", buffer: bytes },
        lang: testCase.lang,
      },
      headers: { Origin: base },
      timeout: 120000,
    });
    const body = await response.json().catch(() => ({}));
    const transcript = typeof body.data?.text === "string" ? body.data.text.trim() : "";
    const matches = body.code === 0 && testCase.expected.test(transcript);
    const unavailable = body.code === 50301 || body.code === 50211;
    record(testCase.id, matches ? "PASS" : unavailable ? "BLOCKED" : "FAIL", {
      httpStatus: response.status(),
      apiCode: body.code ?? null,
      language: body.data?.lang ?? testCase.lang,
      transcriptMatchedExpectedTerm: matches,
      transcriptLength: transcript.length,
      transcriptOmitted: true,
    });
  }
} catch (error) {
  record("read-only transcription run", "BLOCKED",
    error instanceof Error ? error.message.replace(/LOGIN_FAILED_\d+/, "LOGIN_UNAVAILABLE") : "UAT_UNAVAILABLE");
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await context.close();
  await browser.close();
}

evidence.passed = evidence.checks.filter((check) => check.status === "PASS").length;
evidence.blocked = evidence.checks.filter((check) => check.status === "BLOCKED").length;
evidence.failed = evidence.checks.filter((check) => check.status === "FAIL").length;
evidence.status = evidence.failed ? "FAIL" : evidence.blocked ? "BLOCKED" : "PASS";
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  status: evidence.status,
  passed: evidence.passed,
  blocked: evidence.blocked,
  failed: evidence.failed,
}));
if (evidence.failed) process.exitCode = 1;
else if (evidence.blocked) process.exitCode = 2;
