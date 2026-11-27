import assert from "node:assert/strict";
import { test } from "node:test";
import * as benchmark from "./transcription-benchmark.mjs";
import {
  evaluateTranscriptionBenchmark,
  transcriptionBenchmarkCases,
  transcriptionMetricsMeetThresholds,
} from "./transcription-benchmark.mjs";

test("synthetic ASR benchmark has 50 utterances per target language and five per scenario", () => {
  assert.equal(transcriptionBenchmarkCases.filter((testCase) => testCase.lang === "en-AU").length, 50);
  assert.equal(transcriptionBenchmarkCases.filter((testCase) => testCase.lang === "zh-CN").length, 50);
  assert.ok(transcriptionBenchmarkCases.filter((testCase) => testCase.lang === "en-AU")
    .every((testCase) => testCase.voiceLocale === "en-AU"));
  assert.ok(transcriptionBenchmarkCases.filter((testCase) => testCase.lang === "zh-CN")
    .every((testCase) => testCase.voiceLocale === "zh-CN"));
  assert.equal(new Set(transcriptionBenchmarkCases.map((testCase) => testCase.id)).size, 100);
  for (const lang of ["en-AU", "zh-CN"]) {
    for (const category of ["product", "barcode", "numbers", "dates", "inventory", "sales", "negation", "noise", "pause", "code-switch"]) {
      assert.equal(transcriptionBenchmarkCases.filter((testCase) => testCase.lang === lang && testCase.category === category).length, 5);
    }
  }
});

test("benchmark reports language WER and critical-entity accuracy without transcript output", () => {
  const exact = transcriptionBenchmarkCases.map((testCase) => ({ caseId: testCase.id, transcript: testCase.expectedText }));
  const metrics = evaluateTranscriptionBenchmark(transcriptionBenchmarkCases, exact);
  assert.equal(metrics["en-AU"].wer, 0);
  assert.equal(metrics["zh-CN"].wer, 0);
  assert.equal(metrics["en-AU"].criticalEntityAccuracy, 1);
  assert.equal(metrics["zh-CN"].criticalEntityAccuracy, 1);
  for (const lang of ["en-AU", "zh-CN"]) {
    for (const entityType of ["productIdentifiers", "barcodes", "numbers", "dates"]) {
      assert.equal(metrics[lang].criticalEntityTypes[entityType].accuracy, 1);
      assert.ok(metrics[lang].criticalEntityTypes[entityType].cases > 0);
    }
  }
  assert.equal(transcriptionMetricsMeetThresholds(metrics), true);
  assert.equal(JSON.stringify(metrics).includes(transcriptionBenchmarkCases[0].expectedText), false);

  const sample = transcriptionBenchmarkCases.filter((testCase) => ["en-01", "zh-01"].includes(testCase.id));
  const wrongProduct = evaluateTranscriptionBenchmark(sample, [
    { caseId: "en-01", transcript: "How many unknown cans do we have?" },
    { caseId: "zh-01", transcript: "VB罐装啤酒现在还有多少？" },
  ]);
  assert.equal(wrongProduct["en-AU"].criticalEntityAccuracy, 0);
  assert.equal(wrongProduct["en-AU"].criticalEntityTypes.productIdentifiers.accuracy, 0);
  assert.equal(wrongProduct["zh-CN"].criticalEntityAccuracy, 1);
});

test("partial ASR batches score only cases with returned transcriptions", () => {
  const sample = transcriptionBenchmarkCases.filter((testCase) => ["en-01", "zh-01"].includes(testCase.id));
  const metrics = evaluateTranscriptionBenchmark(sample, [
    { caseId: "en-01", transcript: sample.find((testCase) => testCase.id === "en-01").expectedText },
  ]);
  assert.equal(metrics["en-AU"].cases, 1);
  assert.equal(metrics["en-AU"].wer, 0);
  assert.equal(metrics["zh-CN"].cases, 0);
  assert.equal(metrics["zh-CN"].wer, null);
});

test("critical number and date accuracy accepts equivalent spoken and numeric forms", () => {
  const cases = [
    { id: "en-number", lang: "en-AU", expectedText: "twenty-seven", category: "numbers", criticalEntities: { numbers: ["twenty-seven"] } },
    { id: "en-date", lang: "en-AU", expectedText: "seventeenth of June", category: "dates", criticalEntities: { dates: ["seventeenth of June"] } },
    { id: "zh-number", lang: "zh-CN", expectedText: "二十七", category: "numbers", criticalEntities: { numbers: ["二十七"] } },
    { id: "zh-date", lang: "zh-CN", expectedText: "六月十七日", category: "dates", criticalEntities: { dates: ["六月十七日"] } },
  ];
  const metrics = evaluateTranscriptionBenchmark(cases, [
    { caseId: "en-number", transcript: "27" },
    { caseId: "en-date", transcript: "June 17" },
    { caseId: "zh-number", transcript: "27" },
    { caseId: "zh-date", transcript: "6月17日" },
  ]);
  assert.equal(metrics["en-AU"].criticalEntityTypes.numbers.accuracy, 1);
  assert.equal(metrics["en-AU"].criticalEntityTypes.dates.accuracy, 1);
  assert.equal(metrics["zh-CN"].criticalEntityTypes.numbers.accuracy, 1);
  assert.equal(metrics["zh-CN"].criticalEntityTypes.dates.accuracy, 1);
});

test("critical English date accuracy accepts ordinal digits and weekday ordinals", () => {
  const cases = [
    {
      id: "month-ordinal",
      lang: "en-AU",
      expectedText: "Show stock as of the third of August twenty twenty-six.",
      category: "dates",
      criticalEntities: { dates: ["third of August twenty twenty-six"] },
    },
    {
      id: "weekday-ordinal",
      lang: "en-AU",
      expectedText: "Compare sales from Monday the eighth to Friday the twelfth of September.",
      category: "dates",
      criticalEntities: { dates: ["Monday the eighth", "Friday the twelfth of September"] },
    },
  ];
  const equivalent = evaluateTranscriptionBenchmark(cases, [
    { caseId: "month-ordinal", transcript: "Show stock as of August 3rd 2026." },
    { caseId: "weekday-ordinal", transcript: "Compare sales from Monday 8th to Friday 12th September." },
  ]);
  assert.equal(equivalent["en-AU"].criticalEntityTypes.dates.accuracy, 1);

  const wrongWeekday = evaluateTranscriptionBenchmark([cases[1]], [
    { caseId: "weekday-ordinal", transcript: "Compare sales from Tuesday 8th to Friday 12th September." },
  ]);
  assert.equal(wrongWeekday["en-AU"].criticalEntityTypes.dates.accuracy, 0.5);
});

test("quality gate passes target-locale samples and blocks mismatched English synthesis", () => {
  const transcripts = transcriptionBenchmarkCases.map((testCase) => ({ caseId: testCase.id, transcript: testCase.expectedText }));
  const metrics = evaluateTranscriptionBenchmark(transcriptionBenchmarkCases, transcripts);
  const mismatchedEnglishCases = transcriptionBenchmarkCases.map((testCase) => testCase.lang === "en-AU"
    ? { ...testCase, voiceLocale: "en-US" }
    : testCase);
  const initialGate = benchmark.evaluateTranscriptionQualityGate?.({
    cases: mismatchedEnglishCases,
    completedCaseIds: transcripts.map(({ caseId }) => caseId),
    metrics,
  });
  assert.equal(initialGate?.status, "BLOCKED");
  assert.equal(initialGate?.voiceLocaleCoverage["en-AU"].matchingVoiceCases, 0);

  const matchedGate = benchmark.evaluateTranscriptionQualityGate?.({
    cases: transcriptionBenchmarkCases,
    completedCaseIds: transcripts.map(({ caseId }) => caseId),
    metrics,
  });
  assert.equal(matchedGate?.status, "PASS");
  assert.equal(matchedGate?.voiceLocaleCoverage["en-AU"].matchingVoiceCases, 50);
});
