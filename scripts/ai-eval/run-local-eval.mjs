import fs from "node:fs";
import process from "node:process";
import path from "node:path";
import { assistantFixtureContract, assistantUtteranceAcceptance, assistantUtteranceStatus } from "./assistant-assertions.mjs";

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
  const fixtureContract = assistantFixtureContract(testCase.expected || {});
  const blocked = !remote || remote.status === "BLOCKED";
  const assistant = remote?.body?.data && typeof remote.body.data === "object" ? remote.body.data : remote?.body || {};
  const acceptance = remote && !blocked
    ? assistantUtteranceAcceptance(testCase.expected || {}, assistant)
    : null;
  const noWrites = Array.isArray(assistant.writeRequests) && assistant.writeRequests.length === 0;
  const sourceRuntimeMatch = sourceSha !== "unknown" && runtimeSha !== "unknown" && sourceSha === runtimeSha;
  const decision = assistantUtteranceStatus(acceptance || {}, {
    sourceRuntimeMatch,
    unavailable: blocked,
    noWrites,
  });
  const status = blocked ? "BLOCKED" : decision.status;
  results.push({
    caseId: testCase.id,
    category: testCase.category,
    status,
    blockReason: !remote ? "ENDPOINT_NOT_CONFIGURED"
      : blocked ? "SERVICE_UNAVAILABLE" : decision.blockReason,
    assistantStatus: !remote ? "NOT_CONFIGURED" : blocked ? "UNAVAILABLE" : "CHECKED",
    fixtureContract,
    syntheticSnapshotCheck: local,
    acceptance,
    writeRequests: assistant.writeRequests ?? null,
    ...(remote ? { httpStatus: remote.httpStatus, latencyMs: remote.latencyMs, response: remote.body } : {}),
    sourceSha,
    runtimeSha
  });
}

const summary = results.reduce((acc, result) => { acc[result.status] += 1; return acc; }, { PASS: 0, PARTIAL: 0, FAIL: 0, BLOCKED: 0 });
const fixtureContractAudit = {
  complete: results.filter((result) => result.fixtureContract.complete).length,
  incomplete: results.filter((result) => !result.fixtureContract.complete).length,
  missingAnswerAssertions: results.filter((result) => !result.fixtureContract.answerAssertionsPresent)
    .map((result) => result.caseId),
  unsupportedNegativeAssertions: results.filter((result) => !result.fixtureContract.negativeAssertionsPresent)
    .map(({ caseId, fixtureContract }) => ({ caseId, assertions: fixtureContract.unsupportedNegativeAssertions })),
};
const output = { schemaVersion: 3, generatedAt: new Date().toISOString(), sourceSha, runtimeSha, summary, fixtureContractAudit, results };
const outputPath = option("output");
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify(output, null, 2));
if (summary.FAIL > 0) process.exitCode = 1;
else if (summary.PARTIAL > 0 || summary.BLOCKED > 0) process.exitCode = 2;
