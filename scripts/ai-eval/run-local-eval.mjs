import fs from "node:fs";
import process from "node:process";
import path from "node:path";

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const casesPath = option("cases", "scripts/ai-eval/fixtures/utterances.jsonl");
const snapshotPath = option("snapshot", "scripts/ai-eval/fixtures/skr-snapshot.json");
const endpoint = process.env.AI_EVAL_ENDPOINT;
const token = process.env.AI_EVAL_TOKEN;
const sourceSha = process.env.AI_EVAL_SOURCE_SHA || "unknown";
const runtimeSha = process.env.AI_EVAL_RUNTIME_SHA || "unknown";
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
const cases = fs.readFileSync(casesPath, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);

function findProduct(name) { return snapshot.products.find((p) => p.name.toLowerCase() === String(name).toLowerCase()); }
function firstValue(body, keys) {
  for (const key of keys) {
    const value = key.split(".").reduce((current, part) => current == null ? undefined : current[part], body);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function remoteAssertions(testCase, remote) {
  const expected = testCase.expected || {};
  const body = remote?.body || {};
  const actualIntent = firstValue(body, ["intent", "classification.intent", "result.intent"]);
  const actualRoute = firstValue(body, ["route", "destination", "result.route", "card.route"]);
  const writes = firstValue(body, ["writeRequests", "result.writeRequests"]) || [];
  const expectedRoute = expected.route ?? null;
  const intentMatch = expected.intent === undefined || actualIntent === expected.intent;
  const routeMatch = expectedRoute === null
    ? (actualRoute === undefined || actualRoute === null || actualRoute === "")
    : actualRoute === expectedRoute;
  const safetyPass = Array.isArray(writes) && writes.length === 0;
  return { intentMatch, routeMatch, safetyPass, actualIntent, actualRoute, writeRequests: writes };
}

function localExpected(testCase) {
  const expected = testCase.expected || {};
  const result = { intentMatch: true, routeMatch: true, entityMatch: true, dataMatch: true, safetyPass: true, writeRequests: [] };
  if (expected.entities?.product) {
    const product = findProduct(expected.entities.product);
    result.entityMatch = Boolean(product);
    if (product && expected.entities.stock !== undefined) result.dataMatch = product.stock === expected.entities.stock;
  }
  if (expected.data?.revenue !== undefined) {
    const row = snapshot.sales.find((s) => s.date === expected.entities?.date);
    result.dataMatch = Boolean(row && row.revenue === expected.data.revenue);
  }
  return result;
}

async function callAssistant(testCase) {
  if (!endpoint) return null;
  const started = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ text: testCase.question, thread: testCase.context?.thread || [], surface: "assistant" })
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.ok ? "AVAILABLE" : "BLOCKED", httpStatus: response.status, body, latencyMs: Date.now() - started };
  } catch (error) {
    return { status: "BLOCKED", error: error.message, latencyMs: Date.now() - started };
  }
}

const results = [];
for (const testCase of cases) {
  const remote = await callAssistant(testCase);
  const local = localExpected(testCase);
  const blocked = remote && remote.status === "BLOCKED";
  const remoteCheck = remote && !blocked ? remoteAssertions(testCase, remote) : {};
  const checks = { ...local, ...remoteCheck };
  results.push({
    caseId: testCase.id,
    category: testCase.category,
    status: blocked ? "BLOCKED" : (checks.intentMatch && checks.routeMatch && checks.entityMatch && checks.dataMatch && checks.safetyPass ? "PASS" : "FAIL"),
    ...checks,
    ...(remote ? { httpStatus: remote.httpStatus, latencyMs: remote.latencyMs, response: remote.body } : {}),
    sourceSha,
    runtimeSha
  });
}

const summary = results.reduce((acc, result) => { acc[result.status] += 1; return acc; }, { PASS: 0, FAIL: 0, BLOCKED: 0 });
const output = { schemaVersion: 1, generatedAt: new Date().toISOString(), sourceSha, runtimeSha, summary, results };
const outputPath = option("output");
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify(output, null, 2));
if (summary.FAIL > 0) process.exitCode = 1;
