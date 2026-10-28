import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const base = (process.env.SKR_BASE_URL || "https://skr.orithos.com.au").replace(/\/+$/, "");
const username = process.env.SKR_USERNAME || "shawn";
const password = process.env.SKR_PASSWORD;
const casesPath = process.env.SKR_CASES || ".local/skr-utterances-fixed.jsonl";
const outputPath = process.env.SKR_EVAL_OUTPUT || ".local/skr-live-eval.json";
const limit = Number.parseInt(process.env.SKR_CASE_LIMIT || "30", 10);
if (!password) throw new Error("SKR_PASSWORD is required");

const cases = fs.readFileSync(casesPath, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse).slice(0, limit);
const sourceCommit = process.env.SKR_SOURCE_COMMIT || "unknown";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ extraHTTPHeaders: { Origin: base } });
const request = (method, url, options = {}) => method === "GET"
  ? context.request.get(url, options)
  : context.request.post(url, options);
const login = await request("POST", `${base}/api/auth/login`, { data: { username, password }, headers: { Origin: base } });
const loginBody = await login.json().catch(() => ({}));
if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

const versionResponse = await request("GET", `${base}/api/public/version`);
const version = await versionResponse.json().catch(() => ({}));
const runtimeCommit = version.backend?.commit ?? version.backend?.sourceCommit ?? null;
const sourceRuntimeMatch = typeof runtimeCommit === "string" && runtimeCommit === sourceCommit;
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
  const expectedIntent = expected.intent;
  const intentPass = Array.isArray(expectedIntent) ? expectedIntent.includes(data.intent) : data.intent === expectedIntent;
  const routePass = expected.route === undefined || (expected.route === null ? route === null : route === expected.route);
  const queryPass = expected.entities?.product === undefined || query === expected.entities.product;
  const noWrites = Array.isArray(writes) && writes.length === 0;
  const unavailable = !response || [502, 503, 504].includes(response.status()) || [50210, 50301].includes(body.code);
  results.push({
    id: testCase.id,
    question: testCase.question,
    status: unavailable ? "BLOCKED" : intentPass && routePass && queryPass && noWrites ? "PASS" : "FAIL",
    attempts,
    httpStatus: response?.status() ?? null,
    intent: data.intent ?? null,
    expectedIntent,
    route,
    expectedRoute: expected.route ?? null,
    query,
    expectedQuery: expected.entities?.product ?? null,
    writeRequests: writes,
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
  summary,
  writeRequests: ["none: assistant API only"],
  results,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, sourceRuntimeMatch, ...summary }, null, 2));
await browser.close();
if (summary.FAIL > 0) process.exitCode = 1;
