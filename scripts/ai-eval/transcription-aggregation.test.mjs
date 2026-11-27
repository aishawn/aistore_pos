import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTranscriptionSufficientStatistics,
  createTranscriptionPartialReport,
  mergeTranscriptionPartialReports,
  transcriptionDatasetId,
} from "./transcription-aggregation.mjs";
import { evaluateTranscriptionBenchmark, transcriptionBenchmarkCases } from "./transcription-benchmark.mjs";

const identity = {
  sourceCommit: "source-sha",
  runtimeCommit: "source-sha",
  target: "https://demo.example",
  datasetId: transcriptionDatasetId(transcriptionBenchmarkCases),
  asrModel: "model-v1",
  asrConfigId: "config-v1",
};

test("sufficient statistics contain no audio, transcript, or reference text", () => {
  const cases = [{ id: "en-1", lang: "en-AU", category: "product", expectedText: "VB cans", criticalEntities: { productIdentifiers: ["VB cans"] } }];
  const stats = buildTranscriptionSufficientStatistics(cases, [{ caseId: "en-1", transcript: "VB cans" }]);
  assert.deepEqual(stats, [{
    caseId: "en-1", language: "en-AU", category: "product", editCount: 0, referenceTokenCount: 2,
    entities: { productIdentifiers: { matched: 1, count: 1 } },
  }]);
  assert.equal(JSON.stringify(stats).includes("VB cans"), false);
});

test("partial reports merge only with identical run identities and deduplicate exact overlaps", () => {
  const cases = transcriptionBenchmarkCases.filter(({ id }) => ["en-01", "en-02", "zh-01"].includes(id));
  const stats = buildTranscriptionSufficientStatistics(cases, cases.map(({ id, expectedText }) => ({ caseId: id, transcript: expectedText })));
  const first = createTranscriptionPartialReport(identity, stats.slice(0, 2));
  const second = createTranscriptionPartialReport(identity, stats.slice(1));
  const merged = mergeTranscriptionPartialReports([first, second], transcriptionBenchmarkCases);
  assert.equal(merged.caseCount, 3);
  assert.equal(merged.metrics["en-AU"].cases, 2);
  assert.equal(merged.metrics["zh-CN"].cases, 1);
  assert.equal(merged.metrics["en-AU"].wer, 0);
  assert.equal(merged.gate.status, "BLOCKED");

  for (const field of Object.keys(identity)) {
    const conflicting = createTranscriptionPartialReport({ ...identity, [field]: `${identity[field]}-other` }, stats.slice(1));
    assert.throws(() => mergeTranscriptionPartialReports([first, conflicting], transcriptionBenchmarkCases), /identity mismatch/);
  }
});

test("dataset identity changes when an audio fixture changes and requires its fingerprint", () => {
  const cases = [{
    id: "en-audio",
    lang: "en-AU",
    voiceLocale: "en-AU",
    category: "product",
    expectedText: "VB cans",
    criticalEntities: {},
    audioFile: "en-audio.wav",
  }];

  assert.throws(() => transcriptionDatasetId(cases), /audio fingerprint/);
  assert.notEqual(
    transcriptionDatasetId(cases, { "en-audio": "sha256:audio-one" }),
    transcriptionDatasetId(cases, { "en-audio": "sha256:audio-two" }),
  );
});

test("conflicting duplicate case statistics are rejected", () => {
  const cases = [{ id: "en-1", lang: "en-AU", category: "product", expectedText: "VB cans", criticalEntities: {} }];
  const stats = buildTranscriptionSufficientStatistics(cases, [{ caseId: "en-1", transcript: "VB cans" }]);
  const testIdentity = { ...identity, datasetId: transcriptionDatasetId(cases) };
  const first = createTranscriptionPartialReport(testIdentity, stats);
  const changed = createTranscriptionPartialReport(testIdentity, [{ ...stats[0], editCount: 1 }]);
  assert.throws(() => mergeTranscriptionPartialReports([first, changed], cases), /conflicting statistics/);
});

test("partial reports reject text fields nested inside entity statistics", () => {
  const cases = [{ id: "en-1", lang: "en-AU", category: "product", expectedText: "VB cans", criticalEntities: { productIdentifiers: ["VB cans"] } }];
  const stats = buildTranscriptionSufficientStatistics(cases, [{ caseId: "en-1", transcript: "VB cans" }]);
  const unsafe = [{
    ...stats[0],
    entities: { productIdentifiers: { count: 1, matched: 1, transcript: "private utterance" } },
  }];
  const testIdentity = { ...identity, datasetId: transcriptionDatasetId(cases) };

  assert.throws(() => createTranscriptionPartialReport(testIdentity, unsafe), /unexpected field/);
});

test("partial report identity rejects fields outside the fixed safe schema", () => {
  const cases = [{ id: "en-1", lang: "en-AU", category: "product", expectedText: "VB cans", criticalEntities: {} }];
  const testIdentity = { ...identity, datasetId: transcriptionDatasetId(cases), transcript: "private utterance" };

  assert.throws(() => createTranscriptionPartialReport(testIdentity, []), /unexpected identity field/);
});

test("merged sufficient statistics reproduce the original benchmark metrics", () => {
  const cases = transcriptionBenchmarkCases.filter(({ id }) => ["en-01", "en-06", "zh-26"].includes(id));
  const transcripts = cases.map((testCase, index) => ({
    caseId: testCase.id,
    transcript: index === 0 ? "How many VB cans are left?" : testCase.expectedText.replace(/\s+/g, ""),
  }));
  const stats = buildTranscriptionSufficientStatistics(cases, transcripts);
  const partial = createTranscriptionPartialReport(identity, stats);
  const merged = mergeTranscriptionPartialReports([partial], transcriptionBenchmarkCases);

  assert.deepEqual(merged.metrics, evaluateTranscriptionBenchmark(cases, transcripts));
});

test("only a complete original benchmark can pass after combining partial reports", () => {
  const stats = buildTranscriptionSufficientStatistics(
    transcriptionBenchmarkCases,
    transcriptionBenchmarkCases.map(({ id, expectedText }) => ({ caseId: id, transcript: expectedText })),
  );
  const reports = [
    createTranscriptionPartialReport(identity, stats.slice(0, 63)),
    createTranscriptionPartialReport(identity, stats.slice(63)),
  ];
  const merged = mergeTranscriptionPartialReports(reports, transcriptionBenchmarkCases);
  assert.equal(merged.caseCount, 100);
  assert.equal(merged.gate.status, "PASS");
  assert.equal("transcript" in merged, false);
});
