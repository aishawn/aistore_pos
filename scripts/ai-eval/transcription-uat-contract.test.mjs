import assert from "node:assert/strict";
import { test } from "node:test";
import {
  selectTranscriptionUatCases,
  transcriptionMimeTypeForFile,
  summarizeTranscriptionUatResults,
  transcriptionRequestShouldStop,
  transcriptionRuntimeMatchesSource,
  transcriptionUatCasesForRuntime,
} from "./transcription-uat-contract.mjs";

test("online transcription cases run only against the exact source runtime", () => {
  const cases = [{ id: "en" }, { id: "zh" }];
  const version = { frontend: { commit: "abc" }, backend: { commit: "abc" } };
  assert.equal(transcriptionUatCasesForRuntime(cases, version, "abc"), cases);
  assert.deepEqual(transcriptionUatCasesForRuntime(cases, { ...version, backend: { commit: "old" } }, "abc"), []);
  assert.deepEqual(transcriptionUatCasesForRuntime(cases, version, "abc", true), []);
});

test("online transcription runtime gate requires matching frontend and backend commits", () => {
  const version = { frontend: { commit: "ABC" }, backend: { commit: "abc" } };
  assert.equal(transcriptionRuntimeMatchesSource(version, "abc"), true);
  assert.equal(transcriptionRuntimeMatchesSource({ ...version, frontend: { commit: "old" } }, "abc"), false);
  assert.equal(transcriptionRuntimeMatchesSource({ ...version, backend: { commit: "old" } }, "abc"), false);
  assert.equal(transcriptionRuntimeMatchesSource(version, "abc", true), false);
  assert.equal(transcriptionRuntimeMatchesSource(null, "abc"), false);
});

test("online transcription evaluation has an explicit bounded request budget", () => {
  const cases = Array.from({ length: 100 }, (_, index) => ({ id: String(index) }));
  assert.deepEqual(selectTranscriptionUatCases(cases, 10, 3), cases.slice(10, 13));
  assert.throws(() => selectTranscriptionUatCases(cases, 0, 101), /between 1 and 100/);
  assert.throws(() => selectTranscriptionUatCases(cases, -1, 2), /nonnegative integer/);
});

test("online transcription uploads use a supported MIME type inferred from the audio extension", () => {
  for (const [filename, mimeType] of [
    ["sample.wav", "audio/wav"],
    ["sample.WEBM", "audio/webm"],
    ["sample.mp3", "audio/mpeg"],
    ["sample.mp4", "audio/mp4"],
    ["sample.m4a", "audio/mp4"],
    ["sample.ogg", "audio/ogg"],
    ["sample.aac", "audio/aac"],
    ["sample.flac", "audio/flac"],
  ]) assert.equal(transcriptionMimeTypeForFile(filename), mimeType);
  assert.throws(() => transcriptionMimeTypeForFile("sample.unknown"), /unsupported audio file extension/);
  assert.throws(() => transcriptionMimeTypeForFile("no-extension"), /unsupported audio file extension/);
});

test("online ASR requests stop after provider quota exhaustion", () => {
  assert.equal(transcriptionRequestShouldStop(42901), true);
  assert.equal(transcriptionRequestShouldStop(50301), false);
  assert.equal(transcriptionRequestShouldStop(0), false);
});

test("online transcription reports aggregate status and latency without sample data", () => {
  const summary = summarizeTranscriptionUatResults([
    { caseId: "private-id", transcript: "private transcript", language: "en-AU", scenario: "product", status: "PASS", latencyMs: 100 },
    { caseId: "private-id-2", transcript: "private transcript 2", language: "en-AU", scenario: "product", status: "BLOCKED", latencyMs: 300 },
    { language: "en-AU", scenario: "product", status: "NOT_RUN" },
    { language: "zh-CN", scenario: "barcode", status: "FAIL", latencyMs: 200 },
  ]);
  assert.deepEqual(summary, [
    {
      language: "en-AU",
      scenario: "product",
      requested: 3,
      attempted: 2,
      passed: 1,
      failed: 0,
      blocked: 1,
      notRun: 1,
      errorRate: 0.5,
      latencyMs: { samples: 2, p50: 100, p95: 300 },
    },
    {
      language: "zh-CN",
      scenario: "barcode",
      requested: 1,
      attempted: 1,
      passed: 0,
      failed: 1,
      blocked: 0,
      notRun: 0,
      errorRate: 1,
      latencyMs: { samples: 1, p50: 200, p95: 200 },
    },
  ]);
  assert.equal(JSON.stringify(summary).includes("private"), false);
});
