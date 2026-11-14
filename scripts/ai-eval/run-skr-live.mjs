import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { assistantUtteranceAcceptance, assistantUtteranceStatus } from "./assistant-assertions.mjs";

const base = (process.env.SKR_BASE_URL || "https://skr.orithos.com.au").replace(/\/+$/, "");
const username = process.env.SKR_USERNAME || "shawn";
const password = process.env.SKR_PASSWORD;
const casesPath = process.env.SKR_CASES || ".local/skr-utterances-fixed.jsonl";
const outputPath = process.env.SKR_EVAL_OUTPUT || ".local/skr-live-eval.json";
const limit = Number.parseInt(process.env.SKR_CASE_LIMIT || "30", 10);

function writeBlocked(reason, error = null, observedRuntimeCommit = null) {
  const output = {
    generatedAt: new Date().toISOString(),
    target: base,
    sourceCommit: process.env.SKR_SOURCE_COMMIT || "unknown",
    runtimeCommit: observedRuntimeCommit,
    sourceRuntimeMatch: false,
    catalogPath: casesPath,
    selectedCount: 0,
    summary: { PASS: 0, FAIL: 0, BLOCKED: 1 },
    writeRequests: ["none: assistant API only"],
    blockedReason: reason,
    error: error ? String(error.message || error) : null,
    results: [],
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputPath, sourceRuntimeMatch: false, PASS: 0, FAIL: 0, BLOCKED: 1 }, null, 2));
}

if (!password) {
  writeBlocked("MISSING_CREDENTIAL");
  process.exitCode = 2;
  process.exit();
}
if (!fs.existsSync(casesPath)) {
  writeBlocked("MISSING_CASES_FILE");
  process.exitCode = 2;
  process.exit();
}

const cases = fs.readFileSync(casesPath, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse).slice(0, limit);
const sourceCommit = process.env.SKR_SOURCE_COMMIT || "unknown";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ extraHTTPHeaders: { Origin: base } });
const request = (method, url, options = {}) => method === "GET"
  ? context.request.get(url, options)
  : context.request.post(url, options);
let login;
try {
  login = await request("POST", `${base}/api/auth/login`, { data: { username, password }, headers: { Origin: base } });
} catch (error) {
  await browser.close();
  writeBlocked("LOGIN_UNAVAILABLE", error);
  process.exitCode = 2;
  process.exit();
}
const loginBody = await login.json().catch(() => ({}));
if (!login.ok() || loginBody.code !== 0) {
  await browser.close();
  writeBlocked("LOGIN_FAILED", new Error(`LOGIN_FAILED_${login.status()}`));
  process.exitCode = 2;
  process.exit();
}

const versionResponse = await request("GET", `${base}/api/public/version`);
const version = await versionResponse.json().catch(() => ({}));
const runtimeCommit = version.backend?.commit ?? version.backend?.sourceCommit ?? null;
const sourceRuntimeMatch = typeof runtimeCommit === "string" && runtimeCommit === sourceCommit;
if (!sourceRuntimeMatch) {
  await browser.close();
  writeBlocked("SOURCE_RUNTIME_MISMATCH", null, runtimeCommit);
  process.exitCode = 2;
  process.exit();
}
const maxAttempts = Math.min(8, Math.max(1, Number.parseInt(process.env.SKR_MAX_ATTEMPTS || "5", 10)));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
for (const testCase of cases) {
  let response;
  let body = {};
  let error = null;
  let attempts = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    attempts = attempt + 1;
    try {
      response = await request("POST", `${base}/api/ai/assistant`, {
        data: { question: testCase.question },
        headers: { Origin: base },
        timeout: 30000,
      });
      body = await response.json().catch(() => ({}));
      if (![502, 503, 504].includes(response.status()) || attempt + 1 >= maxAttempts) break;
      await sleep(Math.min(8000, 500 * (2 ** attempt)));
    } catch (caught) {
      error = caught;
      if (attempt + 1 >= maxAttempts) break;
      await sleep(Math.min(8000, 500 * (2 ** attempt)));
    }
  }
  const expected = testCase.expected || {};
  const data = body.data ?? {};
  const route = data.ui?.route ?? null;
  const query = data.slots?.query ?? null;
  const writes = Array.isArray(data.writeRequests) ? data.writeRequests : null;
  const acceptance = assistantUtteranceAcceptance(testCase.expected || {}, {
    ...data,
    route,
    writeRequests: writes,
  });
  const noWrites = Array.isArray(writes) && writes.length === 0;
  const unavailable = !response || [502, 503, 504].includes(response.status()) || [50210, 50301].includes(body.code);
  const { status, blockReason } = assistantUtteranceStatus(acceptance, {
    sourceRuntimeMatch,
    unavailable,
    noWrites,
  });
  results.push({
    id: testCase.id,
    question: testCase.question,
    status,
    blockReason,
    attempts,
    httpStatus: response?.status() ?? null,
    intent: data.intent ?? null,
    expectedIntent: expected.intent ?? null,
    route,
    expectedRoute: expected.route ?? null,
    query,
    expectedQuery: expected.entities?.product ?? expected.query ?? null,
    source: data.source ?? null,
    fastPathId: data.fastPathId ?? null,
    llmFallback: data.llmFallback ?? null,
    deterministicRoute: acceptance.deterministicRoute,
    writeRequests: writes,
    writeSafety: acceptance.writeSafety,
    acceptance,
    error: error?.message ?? null,
  });
}
const summary = {
  PASS: results.filter((item) => item.status === "PASS").length,
  FAIL: results.filter((item) => item.status === "FAIL").length,
  BLOCKED: results.filter((item) => item.status === "BLOCKED").length,
};
const output = {
  generatedAt: new Date().toISOString(),
  target: base,
  sourceCommit,
  runtimeCommit,
  sourceRuntimeMatch,
  catalogPath: casesPath,
  selectedCount: cases.length,
  catalogAudit: {
    answerContentAssertionRequired: results.filter((item) => item.acceptance.answerContentAssertionRequired).length,
    answerAssertionsMissing: results.filter((item) => !item.acceptance.answerAssertionsPresent).length,
    missingCases: results.filter((item) => !item.acceptance.answerAssertionsPresent)
      .map(({ id, expectedIntent }) => ({ id, intent: expectedIntent })),
  },
  summary,
  writeRequests: ["none: assistant API only"],
  results,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, sourceRuntimeMatch, ...summary }, null, 2));
await browser.close();
if (summary.FAIL > 0) process.exitCode = 1;
else if (summary.BLOCKED > 0) process.exitCode = 2;
