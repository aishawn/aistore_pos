import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildNativeAsrRequestBody,
  buildProductionAsrRequestBody,
  mergeTranscriptionContextPilotReports,
  providerErrorCode,
  reserveRequestBudget,
  runTranscriptionContextPilot,
  writeContextPilotReport,
} from "./transcription-context-pilot.mjs";

test("context pilot reports merge sufficient statistics by language and category", () => {
  const cases = [
    { id: "en-01", lang: "en-AU", category: "product", expectedText: "How many VB cans?", criticalEntities: { productIdentifiers: ["VB cans"] } },
    { id: "en-02", lang: "en-AU", category: "noise", expectedText: "Stock today, please.", criticalEntities: {} },
    { id: "en-03", lang: "en-AU", category: "dates", expectedText: "Sales yesterday.", criticalEntities: {} },
  ];
  const firstReport = {
    status: "PAIRED_DIAGNOSTIC_COMPLETE", sourceCommit: "f5f12923", endpointHost: "ai.example",
    model: "qwen3-asr-flash", apiMode: "native", datasetManifestSha256: "manifest-a",
    asrConfiguration: { enableItn: true }, caseIds: ["en-01"], pairedCaseIds: ["en-01"], audioSha256: { "en-01": "a".repeat(64) },
    perCaseStatistics: {
      baseline: [{ caseId: "en-01", language: "en-AU", category: "product", editCount: 1, referenceTokenCount: 4, entities: { productIdentifiers: { matched: 0, count: 1 } } }],
      context: [{ caseId: "en-01", language: "en-AU", category: "product", editCount: 0, referenceTokenCount: 4, entities: { productIdentifiers: { matched: 1, count: 1 } } }],
    },
  };
  const secondReport = {
    ...firstReport, status: "BLOCKED", caseIds: ["en-02", "en-03"], pairedCaseIds: ["en-02"],
    audioSha256: { "en-02": "b".repeat(64) },
    perCaseStatistics: {
      baseline: [{ caseId: "en-02", language: "en-AU", category: "noise", editCount: 0, referenceTokenCount: 3, entities: {} }],
      context: [{ caseId: "en-02", language: "en-AU", category: "noise", editCount: 1, referenceTokenCount: 3, entities: {} }],
    },
  };

  const merged = mergeTranscriptionContextPilotReports([firstReport, secondReport], cases);

  assert.equal(merged.caseCount, 2);
  assert.equal(merged.perCaseStatistics.baseline.length, 2);
  assert.equal(merged.audioSha256["en-01"], "a".repeat(64));
  assert.equal(merged.metrics.baseline["en-AU"].wer, 1 / 7);
  assert.equal(merged.metrics.context["en-AU"].wer, 1 / 7);
  assert.equal(merged.metrics.context["en-AU"].criticalEntityAccuracy, 1);
  assert.equal(merged.metrics.context["en-AU"].categories.product.cases, 1);
  assert.equal(merged.metrics.context["en-AU"].categories.noise.cases, 1);
  assert.equal(JSON.stringify(merged).includes(cases[0].expectedText), false);
  assert.throws(() => mergeTranscriptionContextPilotReports([firstReport], cases, { datasetManifestSha256: "different-manifest" }), /manifest mismatch/);
  assert.throws(() => mergeTranscriptionContextPilotReports([firstReport], cases, {
    audioFingerprints: { "en-01": "sha256:" + "f".repeat(64) },
  }), /audio fixture mismatch/);
});

test("context pilot merge rejects mismatched identities and conflicting duplicate samples", () => {
  const testCase = { id: "en-01", lang: "en-AU", category: "product", expectedText: "VB cans", criticalEntities: { productIdentifiers: ["VB cans"] } };
  const stat = { caseId: "en-01", language: "en-AU", category: "product", editCount: 0, referenceTokenCount: 2, entities: { productIdentifiers: { matched: 1, count: 1 } } };
  const report = {
    status: "PAIRED_DIAGNOSTIC_COMPLETE", sourceCommit: "f5f12923", endpointHost: "ai.example",
    model: "qwen3-asr-flash", apiMode: "native", datasetManifestSha256: "manifest-a",
    asrConfiguration: { enableItn: true }, caseIds: ["en-01"], pairedCaseIds: ["en-01"], audioSha256: { "en-01": "c".repeat(64) },
    perCaseStatistics: { baseline: [stat], context: [stat] },
  };
  assert.throws(() => mergeTranscriptionContextPilotReports([report, { ...report, model: "other-model" }], [testCase]), /identity mismatch/);
  assert.throws(() => mergeTranscriptionContextPilotReports([report, {
    ...report,
    apiMode: "POS production Chat Completions transcription shape via Gateway",
    asrConfiguration: { requestShape: "production" },
  }], [testCase]), /identity mismatch/);
  const conflicting = { ...report, perCaseStatistics: { baseline: [{ ...stat, editCount: 1 }], context: [stat] } };
  assert.throws(() => mergeTranscriptionContextPilotReports([report, conflicting], [testCase]), /conflicting statistics/);
});

test("context pilot merge CLI verifies local manifest and audio before writing privacy-preserving output", (t) => {
  const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const outputRoot = path.join(scriptRoot, ".local", "ai-eval");
  fs.mkdirSync(outputRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(outputRoot, "context-merge-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const audio = Buffer.from("synthetic-only-test-audio");
  const audioPath = path.join(directory, "en-01.webm");
  fs.writeFileSync(audioPath, audio);
  const manifestBytes = Buffer.from(JSON.stringify({ cases: [{
    id: "en-01", lang: "en-AU", category: "product", audioFile: "en-01.webm",
    expectedText: "VB cans", criticalEntities: { productIdentifiers: ["VB cans"] },
  }] }));
  const manifestPath = path.join(directory, "manifest.json");
  fs.writeFileSync(manifestPath, manifestBytes);
  const stat = (editCount, matched) => ({
    caseId: "en-01", language: "en-AU", category: "product", editCount, referenceTokenCount: 2,
    entities: { productIdentifiers: { matched, count: 1 } },
  });
  const reportPath = path.join(directory, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify({
    status: "PAIRED_DIAGNOSTIC_COMPLETE", sourceCommit: "f5f12923", endpointHost: "ai.example",
    model: "qwen3-asr-flash", apiMode: "native", datasetManifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
    asrConfiguration: { enableItn: true }, caseIds: ["en-01"], pairedCaseIds: ["en-01"],
    audioSha256: { "en-01": createHash("sha256").update(audio).digest("hex") },
    perCaseStatistics: { baseline: [stat(1, 0)], context: [stat(0, 1)] },
  }));

  const outputPath = path.join(directory, "merged.json");
  const cliPath = path.join(scriptRoot, "scripts", "ai-eval", "merge-transcription-context-pilot.mjs");
  const stdout = execFileSync(process.execPath, [cliPath, manifestPath, outputPath, reportPath], { encoding: "utf8" });
  const merged = JSON.parse(fs.readFileSync(outputPath, "utf8"));

  assert.match(stdout, /PAIRED_DIAGNOSTIC_MERGED/);
  assert.equal(merged.caseCount, 1);
  assert.equal(merged.perCaseStatistics.context[0].entities.productIdentifiers.matched, 1);
  assert.equal(merged.audioSha256["en-01"], createHash("sha256").update(audio).digest("hex"));
  assert.equal(merged.metrics.baseline["en-AU"].wer, 0.5);
  assert.equal(merged.metrics.context["en-AU"].criticalEntityAccuracy, 1);
  assert.equal(JSON.stringify(merged).includes("VB cans"), false);
  fs.writeFileSync(outputPath, "preserve-existing-report");
  const rerun = spawnSync(process.execPath, [cliPath, manifestPath, outputPath, reportPath], { encoding: "utf8" });
  assert.notEqual(rerun.status, 0);
  assert.match(rerun.stderr, /EEXIST/);
  assert.equal(fs.readFileSync(outputPath, "utf8"), "preserve-existing-report");
});

test("context pilot report writer never overwrites an existing report", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "asr-context-write-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const existingPath = path.join(directory, "existing.json");
  fs.writeFileSync(existingPath, "keep-me");
  assert.throws(() => writeContextPilotReport(existingPath, { status: "new" }), { code: "EEXIST" });
  assert.equal(fs.readFileSync(existingPath, "utf8"), "keep-me");

  const newPath = path.join(directory, "new.json");
  writeContextPilotReport(newPath, { status: "new" });
  assert.deepEqual(JSON.parse(fs.readFileSync(newPath, "utf8")), { status: "new" });
});

test("native request uses documented message and ASR option locations", () => {
  const body = buildNativeAsrRequestBody({
    model: "qwen3-asr-flash",
    audioData: "data:audio/webm;base64,AA==",
    language: "en",
    entityGlossary: "VB cans; Carlton Draught",
  });
  assert.equal(body.multiModel, true);
  assert.deepEqual(body.input.messages, [
    { role: "system", content: [{ text: "VB cans; Carlton Draught" }] },
    { role: "user", content: [{ audio: "data:audio/webm;base64,AA==" }] },
  ]);
  assert.deepEqual(body.parameters, { asr_options: { enable_itn: true, language: "en" } });
});

test("production request matches RemoteAiGateway media transcription shape", () => {
  const body = buildProductionAsrRequestBody({
    model: "qwen3-asr-flash",
    audioData: "data:audio/webm;base64,AA==",
    language: "en",
    entityGlossary: "VB cans; Carlton Draught",
  });
  assert.equal(body.multiModel, undefined);
  assert.deepEqual(body.messages, [
    { role: "system", content: "VB cans; Carlton Draught" },
    { role: "user", content: [{ type: "input_audio", input_audio: { data: "data:audio/webm;base64,AA==" } }] },
  ]);
  assert.deepEqual(body.asr_options, { enable_itn: true, language: "en" });
  assert.equal(body.stream, false);
});

test("baseline request omits the system glossary", () => {
  const body = buildNativeAsrRequestBody({
    model: "qwen3-asr-flash",
    audioData: "data:audio/webm;base64,AA==",
    language: "zh",
  });
  assert.deepEqual(body.input.messages, [{ role: "user", content: [{ audio: "data:audio/webm;base64,AA==" }] }]);
});

test("request builder validates audio and language without leaking values", () => {
  assert.throws(() => buildNativeAsrRequestBody({ model: "qwen3-asr-flash", audioData: "secret", language: "en" }), /audioData/);
  assert.throws(() => buildNativeAsrRequestBody({ model: "qwen3-asr-flash", audioData: "data:audio/webm;base64,AA==", language: "en-AU" }), /language/);
});

test("request runner rejects duplicate case IDs before reserving requests", async () => {
  await assert.rejects(runTranscriptionContextPilot({
    cases: [{ id: "en-01" }, { id: "en-01" }],
    audioDirectory: ".", baseUrl: "https://gateway.example", token: "test-token",
  }), /case IDs must be unique/);
});

test("UTC budget reserves at most eight requests and resets on the next hour", () => {
  let ledger = { schemaVersion: 1, buckets: { "2026-11-28T06:00:00.000Z": 7 } };
  const finalSlot = reserveRequestBudget(ledger, new Date("2026-11-28T06:59:00Z"));
  assert.equal(finalSlot.allowed, true);
  assert.equal(finalSlot.used, 8);
  ledger = finalSlot.ledger;
  const blocked = reserveRequestBudget(ledger, new Date("2026-11-28T06:59:59Z"));
  assert.equal(blocked.allowed, false);
  const nextHour = reserveRequestBudget(ledger, new Date("2026-11-28T07:00:00Z"));
  assert.equal(nextHour.allowed, true);
  assert.equal(nextHour.used, 1);
});

test("provider error normalization retains only a safe code", () => {
  assert.equal(providerErrorCode({ error: { code: "invalid_parameter_error", message: "raw details" } }), "invalid_parameter_error");
  assert.equal(providerErrorCode({ error: { code: "bad code", message: "secret transcript" } }), "provider_error");
  assert.equal(providerErrorCode({ error: { message: "gateway timeout" } }, 504), "provider_timeout");
  assert.equal(providerErrorCode({ error: { message: "rate limit details" } }, 429), "provider_rate_limited");
  assert.equal(providerErrorCode({ error: { message: "internal response" } }, 503), "provider_server_error");
});

test("paired runner persists mergeable per-case metrics without transcripts", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "asr-context-pilot-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, "en-01.webm"), Buffer.from("synthetic-audio"));
  const testCase = {
    id: "en-01", lang: "en-AU", category: "product", audioFile: "en-01.webm",
    expectedText: "How many VB cans do we have?",
    criticalEntities: { productIdentifiers: ["VB cans"] },
  };
  let calls = 0;
  const result = await runTranscriptionContextPilot({
    cases: [testCase], audioDirectory: directory, baseUrl: "https://gateway.example", token: "test-token",
    glossaryByLanguage: { "en-AU": "VB cans" },
    now: () => new Date("2026-11-28T07:01:00Z"),
    fetchImpl: async (_url, options) => {
      calls += 1;
      const body = JSON.parse(options.body);
      if (calls === 1) assert.equal(body.input.messages[0].role, "user");
      else assert.equal(body.input.messages[0].role, "system");
      return new Response(JSON.stringify({ output: { choices: [{ message: { content: [{ text: testCase.expectedText }] } }] } }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    },
  });
  assert.equal(result.status, "PAIRED_DIAGNOSTIC_COMPLETE");
  assert.equal(result.requestsAttempted, 2);
  assert.equal(result.metrics.baseline["en-AU"].wer, 0);
  assert.equal(result.metrics.context["en-AU"].criticalEntityAccuracy, 1);
  assert.deepEqual(result.perCaseStatistics.baseline, [{
    caseId: "en-01",
    language: "en-AU",
    category: "product",
    editCount: 0,
    referenceTokenCount: 7,
    entities: { productIdentifiers: { matched: 1, count: 1 } },
  }]);
  assert.deepEqual(result.perCaseStatistics.context, result.perCaseStatistics.baseline);
  assert.equal(JSON.stringify(result).includes(testCase.expectedText), false);
  assert.equal(result.rawAudioPersisted, false);
  assert.equal(result.rawTranscriptsPersisted, false);
});

test("paired runner can send the POS production request shape for a diagnostic", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "asr-context-production-shape-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, "en-01.webm"), Buffer.from("synthetic-audio"));
  const testCase = {
    id: "en-01", lang: "en-AU", category: "product", audioFile: "en-01.webm",
    expectedText: "How many VB cans do we have?", criticalEntities: { productIdentifiers: ["VB cans"] },
  };
  const bodies = [];
  const result = await runTranscriptionContextPilot({
    cases: [testCase], audioDirectory: directory, baseUrl: "https://gateway.example", token: "test-token",
    requestShape: "production", glossaryByLanguage: { "en-AU": "VB cans" },
    now: () => new Date("2026-11-28T07:01:00Z"),
    fetchImpl: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: testCase.expectedText } }] }), { status: 200 });
    },
  });
  assert.equal(result.status, "PAIRED_DIAGNOSTIC_COMPLETE");
  assert.deepEqual(bodies[0].messages, [
    { role: "user", content: [{ type: "input_audio", input_audio: { data: "data:audio/webm;base64,c3ludGhldGljLWF1ZGlv" } }] },
  ]);
  assert.deepEqual(bodies[1].messages[0], { role: "system", content: "VB cans" });
  assert.deepEqual(bodies[0].asr_options, { enable_itn: true, language: "en" });
  assert.equal(bodies[0].multiModel, undefined);
});

test("incomplete run retains completed pairs but excludes the failed pair", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "asr-context-pilot-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, "en-01.webm"), Buffer.from("synthetic-audio"));
  fs.writeFileSync(path.join(directory, "en-02.webm"), Buffer.from("synthetic-audio-2"));
  const testCase = {
    id: "en-01", lang: "en-AU", category: "product", audioFile: "en-01.webm",
    expectedText: "How many VB cans do we have?", criticalEntities: { productIdentifiers: ["VB cans"] },
  };
  const failedCase = {
    id: "en-02", lang: "en-AU", category: "dates", audioFile: "en-02.webm",
    expectedText: "What date were sales?", criticalEntities: {},
  };
  let calls = 0;
  const result = await runTranscriptionContextPilot({
    cases: [testCase, failedCase], audioDirectory: directory, baseUrl: "https://gateway.example", token: "test-token",
    now: () => new Date("2026-11-28T07:01:00Z"),
    fetchImpl: async () => {
      calls += 1;
      return calls <= 2
        ? new Response(JSON.stringify({ output: { choices: [{ message: { content: "How many VB cans do we have?" } }] } }), { status: 200 })
        : new Response(JSON.stringify({ error: { code: "invalid_parameter_error", message: "do not retain" } }), { status: 504 });
    },
  });
  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.pairedCaseIds, ["en-01"]);
  assert.equal(result.metrics.baseline["en-AU"].cases, 1);
  assert.equal(result.metrics.context["en-AU"].wer, 0);
  assert.equal(result.perCaseStatistics.baseline.length, 1);
  assert.equal(result.requestsAttempted, 3);
  assert.equal(result.requests[2].providerCode, "invalid_parameter_error");
  assert.equal(JSON.stringify(result).includes("do not retain"), false);
});

test("runner blocks before sending if a complete pair would exceed the hourly budget", async () => {
  const testCase = {
    id: "en-01", lang: "en-AU", category: "product", audioFile: "en-01.webm",
    expectedText: "How many VB cans do we have?", criticalEntities: { productIdentifiers: ["VB cans"] },
  };
  let calls = 0;
  const result = await runTranscriptionContextPilot({
    cases: [testCase], audioDirectory: ".", baseUrl: "https://gateway.example", token: "test-token",
    budgetLedger: { schemaVersion: 1, buckets: { "2026-11-28T07:00:00.000Z": 7 } },
    now: () => new Date("2026-11-28T07:10:00Z"),
    fetchImpl: async () => { calls += 1; throw new Error("must not send"); },
  });
  assert.equal(result.status, "BLOCKED_RATE_BUDGET");
  assert.equal(result.requestsAttempted, 0);
  assert.equal(calls, 0);
});
