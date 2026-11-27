import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { evaluateTranscriptionCase, evaluateTranscriptionQualityGate } from "./transcription-benchmark.mjs";

const schemaVersion = 1;
const identityFields = ["sourceCommit", "runtimeCommit", "target", "datasetId", "asrModel", "asrConfigId"];
const entityTypes = new Set(["productIdentifiers", "barcodes", "numbers", "dates"]);

export function buildTranscriptionSufficientStatistics(cases, transcripts) {
  const transcriptById = new Map();
  for (const result of transcripts) {
    if (!result || typeof result.caseId !== "string" || typeof result.transcript !== "string") {
      throw new TypeError("transcription result requires caseId and transcript");
    }
    if (transcriptById.has(result.caseId)) throw new Error(`duplicate transcript caseId: ${result.caseId}`);
    transcriptById.set(result.caseId, result.transcript);
  }
  const caseById = new Map(cases.map((testCase) => [testCase.id, testCase]));
  return [...transcriptById].map(([caseId, transcript]) => {
    const testCase = caseById.get(caseId);
    if (!testCase) throw new Error(`unknown benchmark caseId: ${caseId}`);
    return evaluateTranscriptionCase(testCase, transcript);
  });
}

export function createTranscriptionPartialReport(identity, sufficientStatistics) {
  validateIdentity(identity);
  validateStats(sufficientStatistics);
  const seen = new Set();
  for (const stat of sufficientStatistics) {
    if (seen.has(stat.caseId)) throw new Error(`duplicate caseId in report: ${stat.caseId}`);
    seen.add(stat.caseId);
  }
  return { schemaVersion, identity: { ...identity }, sufficientStatistics };
}

export function transcriptionAudioFingerprints(cases, directory) {
  const root = path.resolve(directory);
  return Object.fromEntries(cases.filter(({ audioFile }) => audioFile).map(({ id, audioFile }) => {
    const file = path.resolve(root, audioFile);
    const relative = path.relative(root, file);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`audio fixture must stay under manifest directory: ${id}`);
    }
    return [id, `sha256:${createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`];
  }));
}

export function transcriptionDatasetId(cases, audioFingerprints = {}) {
  const dataset = cases.map(({ id, lang, voiceLocale, category, expectedText, criticalEntities, audioFile }) => {
    const audioFingerprint = audioFile ? audioFingerprints[id] : null;
    if (audioFile && (typeof audioFingerprint !== "string" || !audioFingerprint.trim())) {
      throw new Error(`audio fingerprint is required for case ${id}`);
    }
    return {
      id, lang, voiceLocale, category, expectedText, criticalEntities: criticalEntities ?? {}, audioFingerprint,
    };
  });
  return `sha256:${createHash("sha256").update(stableStringify(dataset)).digest("hex")}`;
}

export function mergeTranscriptionPartialReports(reports, benchmarkCases, audioFingerprints = {}) {
  if (!Array.isArray(reports) || reports.length === 0) throw new TypeError("at least one partial report is required");
  if (!Array.isArray(benchmarkCases) || benchmarkCases.length === 0) throw new TypeError("benchmark cases are required");
  const first = reports[0];
  validateReport(first);
  const identity = first.identity;
  if (identity.sourceCommit !== identity.runtimeCommit) {
    throw new Error("partial report identity mismatch: source and runtime commits differ");
  }
  if (identity.datasetId !== transcriptionDatasetId(benchmarkCases, audioFingerprints)) {
    throw new Error("partial report identity mismatch: dataset does not match supplied benchmark cases");
  }
  const benchmarkById = new Map(benchmarkCases.map((testCase) => [testCase.id, testCase]));
  const byCaseId = new Map();

  for (const report of reports) {
    validateReport(report);
    if (identityFields.some((field) => report.identity[field] !== identity[field])) {
      throw new Error("partial report identity mismatch");
    }
    for (const stat of report.sufficientStatistics) {
      const testCase = benchmarkById.get(stat.caseId);
      if (!testCase) throw new Error(`unknown benchmark caseId: ${stat.caseId}`);
      if (stat.language !== testCase.lang || stat.category !== testCase.category) {
        throw new Error(`case metadata mismatch for ${stat.caseId}`);
      }
      const expected = evaluateTranscriptionCase(testCase, "");
      if (stat.referenceTokenCount !== expected.referenceTokenCount
        || stableStringify(Object.fromEntries(Object.entries(stat.entities).map(([type, counts]) => [type, counts.count])))
          !== stableStringify(Object.fromEntries(Object.entries(expected.entities).map(([type, counts]) => [type, counts.count])))) {
        throw new Error(`case statistics shape mismatch for ${stat.caseId}`);
      }
      const previous = byCaseId.get(stat.caseId);
      if (previous && stableStringify(previous) !== stableStringify(stat)) {
        throw new Error(`conflicting statistics for caseId: ${stat.caseId}`);
      }
      byCaseId.set(stat.caseId, stat);
    }
  }

  const metrics = aggregateMetrics([...byCaseId.values()]);
  const completedCaseIds = [...byCaseId.keys()];
  const gate = evaluateTranscriptionQualityGate({ cases: benchmarkCases, completedCaseIds, metrics });
  return { schemaVersion, identity: { ...identity }, caseCount: byCaseId.size, metrics, gate };
}


function aggregateMetrics(stats) {
  const metrics = {};
  for (const language of ["en-AU", "zh-CN"]) {
    const languageStats = stats.filter((stat) => stat.language === language);
    let edits = 0;
    let referenceTokens = 0;
    let criticalEntities = 0;
    let matchedCriticalEntities = 0;
    const criticalEntityTypes = {};
    const categories = {};
    for (const stat of languageStats) {
      edits += stat.editCount;
      referenceTokens += stat.referenceTokenCount;
      const category = categories[stat.category] ?? { cases: 0, criticalEntities: 0, matchedCriticalEntities: 0 };
      category.cases++;
      for (const [entityType, counts] of Object.entries(stat.entities)) {
        const entity = criticalEntityTypes[entityType] ?? { cases: 0, matched: 0 };
        entity.cases += counts.count;
        entity.matched += counts.matched;
        criticalEntities += counts.count;
        matchedCriticalEntities += counts.matched;
        category.criticalEntities += counts.count;
        category.matchedCriticalEntities += counts.matched;
        criticalEntityTypes[entityType] = entity;
      }
      categories[stat.category] = category;
    }
    metrics[language] = {
      cases: languageStats.length,
      wer: referenceTokens ? edits / referenceTokens : null,
      criticalEntityAccuracy: criticalEntities ? matchedCriticalEntities / criticalEntities : null,
      criticalEntities,
      criticalEntityTypes: Object.fromEntries(Object.entries(criticalEntityTypes).map(([name, counts]) => [
        name,
        { ...counts, accuracy: counts.cases ? counts.matched / counts.cases : null },
      ])),
      categories,
    };
  }
  return metrics;
}

function validateIdentity(identity) {
  if (!identity || typeof identity !== "object" || identityFields.some((field) => typeof identity[field] !== "string" || !identity[field].trim())) {
    throw new TypeError(`identity must include non-empty ${identityFields.join(", ")}`);
  }
  if (Object.keys(identity).some((field) => !identityFields.includes(field))) {
    throw new TypeError("unexpected identity field");
  }
}

function validateStats(stats) {
  if (!Array.isArray(stats)) throw new TypeError("sufficientStatistics must be an array");
  for (const stat of stats) {
    if (!stat || typeof stat.caseId !== "string" || !stat.caseId || !["en-AU", "zh-CN"].includes(stat.language)
      || typeof stat.category !== "string" || !stat.category
      || !Number.isInteger(stat.editCount) || stat.editCount < 0
      || !Number.isInteger(stat.referenceTokenCount) || stat.referenceTokenCount < 0
      || !stat.entities || typeof stat.entities !== "object" || Array.isArray(stat.entities)) {
      throw new TypeError("invalid sufficient statistics record");
    }
    if (Object.keys(stat).some((key) => !["caseId", "language", "category", "editCount", "referenceTokenCount", "entities"].includes(key))) {
      throw new TypeError(`unexpected field in sufficient statistics for ${stat.caseId}`);
    }
    for (const [entityType, counts] of Object.entries(stat.entities)) {
      if (!entityTypes.has(entityType)) throw new TypeError(`unsupported entity type for ${stat.caseId}: ${entityType}`);
      if (!counts || !Number.isInteger(counts.count) || counts.count < 0
        || !Number.isInteger(counts.matched) || counts.matched < 0 || counts.matched > counts.count) {
        throw new TypeError(`invalid entity statistics for ${stat.caseId}`);
      }
      if (Object.keys(counts).some((key) => !["count", "matched"].includes(key))) {
        throw new TypeError(`unexpected field in entity statistics for ${stat.caseId}`);
      }
    }
  }
}

function validateReport(report) {
  if (!report || report.schemaVersion !== schemaVersion) throw new Error("unsupported partial report schema");
  validateIdentity(report.identity);
  validateStats(report.sufficientStatistics);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
