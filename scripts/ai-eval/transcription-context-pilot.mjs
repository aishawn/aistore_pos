#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { aggregateTranscriptionSufficientStatistics } from "./transcription-aggregation.mjs";
import { evaluateTranscriptionBenchmark, evaluateTranscriptionCase } from "./transcription-benchmark.mjs";

export const MAX_ASR_REQUESTS_PER_UTC_HOUR = 8;

export function buildNativeAsrRequestBody({ model, audioData, language, entityGlossary = "" }) {
  if (!model?.trim()) throw new TypeError("model is required");
  if (!audioData?.startsWith("data:audio/")) throw new TypeError("audioData must be an audio data URI");
  if (!new Set(["en", "zh"]).has(language)) throw new TypeError("language must be en or zh");

  const messages = [];
  const glossary = String(entityGlossary ?? "").trim();
  if (glossary) messages.push({ role: "system", content: [{ text: glossary }] });
  messages.push({ role: "user", content: [{ audio: audioData }] });

  return {
    model: model.trim(),
    input: { messages },
    parameters: { asr_options: { enable_itn: true, language } },
    multiModel: true,
  };
}

export function buildProductionAsrRequestBody({ model, audioData, language, entityGlossary = "" }) {
  if (!model?.trim()) throw new TypeError("model is required");
  if (!audioData?.startsWith("data:audio/")) throw new TypeError("audioData must be an audio data URI");
  if (!new Set(["en", "zh"]).has(language)) throw new TypeError("language must be en or zh");

  const messages = [];
  const glossary = String(entityGlossary ?? "").trim();
  if (glossary) messages.push({ role: "system", content: glossary });
  messages.push({ role: "user", content: [{ type: "input_audio", input_audio: { data: audioData } }] });

  return {
    model: model.trim(),
    messages,
    stream: false,
    asr_options: { enable_itn: true, language },
  };
}

export function utcHourBucket(value = new Date()) {
  const date = new Date(value);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

export function reserveRequestBudget(ledger, now = new Date()) {
  const bucket = utcHourBucket(now);
  const buckets = { ...(ledger?.buckets ?? {}) };
  const used = Number(buckets[bucket] ?? 0);
  if (!Number.isInteger(used) || used < 0) throw new TypeError("invalid ASR request budget ledger");
  if (used >= MAX_ASR_REQUESTS_PER_UTC_HOUR) {
    return { allowed: false, bucket, used, ledger: { schemaVersion: 1, buckets } };
  }

  buckets[bucket] = used + 1;
  return { allowed: true, bucket, used: used + 1, ledger: { schemaVersion: 1, buckets } };
}

export function providerErrorCode(payload, httpStatus = null) {
  const candidate = payload?.error?.code ?? payload?.code ?? payload?.detail?.code;
  if (typeof candidate === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(candidate)) return candidate;
  if (httpStatus === 408 || httpStatus === 504) return "provider_timeout";
  if (httpStatus === 429) return "provider_rate_limited";
  if (Number.isInteger(httpStatus) && httpStatus >= 500) return "provider_server_error";
  if (Number.isInteger(httpStatus) && httpStatus >= 400) return "provider_rejected";
  return "provider_error";
}

export function extractNativeTranscript(payload) {
  const root = payload?.output ?? payload;
  const content = root?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const text = content.map((part) => {
    if (typeof part === "string") return part;
    return typeof part?.text === "string" ? part.text : "";
  }).join("");
  return text || null;
}

export function writeContextPilotReport(outputPath, report) {
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

export function mergeTranscriptionContextPilotReports(reports, benchmarkCases, {
  audioFingerprints = {},
  datasetManifestSha256,
} = {}) {
  if (!Array.isArray(reports) || reports.length === 0) throw new TypeError("at least one context pilot report is required");
  if (!Array.isArray(benchmarkCases) || benchmarkCases.length === 0) throw new TypeError("benchmark cases are required");

  const identityFields = ["sourceCommit", "endpointHost", "model", "apiMode", "datasetManifestSha256", "asrConfiguration"];
  const first = reports[0];
  validateContextPilotReport(first, identityFields);
  const identity = Object.fromEntries(identityFields.map((field) => [field, first[field]]));
  if (datasetManifestSha256 && identity.datasetManifestSha256 !== datasetManifestSha256) {
    throw new Error("context pilot report dataset manifest mismatch");
  }
  const caseById = new Map(benchmarkCases.map((testCase) => [testCase.id, testCase]));
  const statistics = { baseline: new Map(), context: new Map() };
  const audioHashes = new Map();

  for (const report of reports) {
    validateContextPilotReport(report, identityFields);
    if (identityFields.some((field) => stableStringify(report[field]) !== stableStringify(identity[field]))) {
      throw new Error("context pilot report identity mismatch");
    }

    const requestedCaseIds = new Set(report.caseIds);
    if (requestedCaseIds.size !== report.caseIds.length) throw new Error("duplicate case ID in context pilot report");
    for (const caseId of report.caseIds) {
      if (!caseById.has(caseId)) throw new Error(`unknown requested benchmark caseId: ${caseId}`);
    }
    if (!Array.isArray(report.pairedCaseIds)) throw new TypeError("context pilot report must include paired case IDs");
    const reportCaseIds = new Set(report.pairedCaseIds);
    if (reportCaseIds.size !== report.pairedCaseIds.length
      || report.pairedCaseIds.some((caseId) => !requestedCaseIds.has(caseId))) {
      throw new Error("paired case IDs must be unique requested case IDs");
    }
    for (const caseId of report.pairedCaseIds) {
      if (!caseById.has(caseId)) throw new Error(`unknown benchmark caseId: ${caseId}`);
      const audioHash = report.audioSha256?.[caseId];
      if (typeof audioHash !== "string" || !/^[a-f0-9]{64}$/.test(audioHash)) {
        throw new Error(`missing or invalid audio fingerprint for ${caseId}`);
      }
      const expectedAudioHash = audioFingerprints[caseId]?.replace(/^sha256:/, "");
      if (expectedAudioHash && expectedAudioHash !== audioHash) {
        throw new Error(`audio fixture mismatch for ${caseId}`);
      }
      const previousHash = audioHashes.get(caseId);
      if (previousHash && previousHash !== audioHash) throw new Error(`conflicting audio fingerprint for ${caseId}`);
      audioHashes.set(caseId, audioHash);
    }

    for (const variant of ["baseline", "context"]) {
      const stats = report.perCaseStatistics[variant];
      if (!Array.isArray(stats) || stats.length !== report.pairedCaseIds.length) {
        throw new Error(`incomplete ${variant} statistics in context pilot report`);
      }
      const seen = new Set();
      for (const stat of stats) {
        if (seen.has(stat.caseId) || !reportCaseIds.has(stat.caseId)) {
          throw new Error(`case IDs mismatch in ${variant} statistics`);
        }
        seen.add(stat.caseId);
        validateContextPilotStatistic(stat, caseById.get(stat.caseId));
        const previous = statistics[variant].get(stat.caseId);
        if (previous && stableStringify(previous) !== stableStringify(stat)) {
          throw new Error(`conflicting statistics for caseId: ${stat.caseId}`);
        }
        statistics[variant].set(stat.caseId, stat);
      }
    }
  }

  const caseIds = [...new Set([...statistics.baseline.keys(), ...statistics.context.keys()])].sort();
  if (caseIds.length === 0 || caseIds.some((caseId) => !statistics.baseline.has(caseId) || !statistics.context.has(caseId))) {
    throw new Error("baseline and context coverage differ");
  }
  const perCaseStatistics = Object.fromEntries(Object.entries(statistics).map(([variant, byCaseId]) => [
    variant,
    caseIds.map((caseId) => byCaseId.get(caseId)),
  ]));

  return {
    schemaVersion: 1,
    status: "PAIRED_DIAGNOSTIC_MERGED",
    scope: "PROVIDER_DIAGNOSTIC_ONLY",
    identity,
    reportCount: reports.length,
    caseCount: caseIds.length,
    caseIds,
    audioSha256: Object.fromEntries(caseIds.map((caseId) => [caseId, audioHashes.get(caseId)])),
    perCaseStatistics,
    metrics: Object.fromEntries(Object.entries(perCaseStatistics).map(([variant, stats]) => [
      variant,
      aggregateTranscriptionSufficientStatistics(stats),
    ])),
    qualityGate: "NOT_EVALUATED_DIAGNOSTIC_ONLY",
    rawAudioPersisted: false,
    rawTranscriptsPersisted: false,
  };
}

function validateContextPilotReport(report, identityFields) {
  if (!report || !["PAIRED_DIAGNOSTIC_COMPLETE", "BLOCKED", "INCOMPLETE"].includes(report.status)
    || !report.perCaseStatistics) {
    throw new TypeError("a context pilot report with complete-pair statistics is required");
  }
  for (const field of identityFields) {
    const value = report[field];
    if (typeof value === "string" && value.trim()) continue;
    if (field === "asrConfiguration" && value && typeof value === "object" && !Array.isArray(value)) continue;
    throw new TypeError(`context pilot report is missing identity field: ${field}`);
  }
  if (!Array.isArray(report.caseIds) || report.caseIds.length === 0) {
    throw new TypeError("context pilot report must include case IDs");
  }
}

function validateContextPilotStatistic(stat, testCase) {
  if (!testCase || stat.language !== testCase.lang || stat.category !== testCase.category) {
    throw new Error(`case metadata mismatch for ${stat?.caseId ?? "unknown"}`);
  }
  const expected = evaluateTranscriptionCase(testCase, "");
  const expectedEntityCounts = Object.fromEntries(Object.entries(expected.entities).map(([type, counts]) => [type, counts.count]));
  const actualEntityCounts = Object.fromEntries(Object.entries(stat.entities ?? {}).map(([type, counts]) => [type, counts.count]));
  if (stat.referenceTokenCount !== expected.referenceTokenCount
    || stableStringify(actualEntityCounts) !== stableStringify(expectedEntityCounts)) {
    throw new Error(`case statistics shape mismatch for ${stat.caseId}`);
  }
  aggregateTranscriptionSufficientStatistics([stat]);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function audioMimeType(audioFile) {
  const extension = path.extname(audioFile).toLowerCase();
  return ({ ".webm": "audio/webm", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4" })[extension] ?? null;
}

export async function runTranscriptionContextPilot({
  cases,
  audioDirectory,
  baseUrl,
  token,
  model = "qwen3-asr-flash",
  requestShape = "native",
  glossaryByLanguage = {},
  budgetLedger = { schemaVersion: 1, buckets: {} },
  persistBudgetLedger,
  fetchImpl = fetch,
  now = () => new Date(),
}) {
  if (!Array.isArray(cases) || cases.length === 0) throw new TypeError("at least one benchmark case is required");
  if (new Set(cases.map(({ id }) => id)).size !== cases.length) throw new TypeError("benchmark case IDs must be unique");
  if (cases.length * 2 > MAX_ASR_REQUESTS_PER_UTC_HOUR) {
    throw new RangeError(`at most ${MAX_ASR_REQUESTS_PER_UTC_HOUR / 2} paired cases are allowed per UTC hour`);
  }
  if (!baseUrl || !token) throw new TypeError("baseUrl and token are required");
  if (!new Set(["native", "production"]).has(requestShape)) throw new TypeError("requestShape must be native or production");

  const initialBucket = utcHourBucket(now());
  const usedBeforeRun = Number(budgetLedger?.buckets?.[initialBucket] ?? 0);
  if (!Number.isInteger(usedBeforeRun) || usedBeforeRun < 0 || usedBeforeRun > MAX_ASR_REQUESTS_PER_UTC_HOUR) {
    throw new TypeError("invalid ASR request budget ledger");
  }
  if (usedBeforeRun + cases.length * 2 > MAX_ASR_REQUESTS_PER_UTC_HOUR) {
    return {
      status: "BLOCKED_RATE_BUDGET",
      requestsAttempted: 0,
      maxRequestsPerUtcHour: MAX_ASR_REQUESTS_PER_UTC_HOUR,
      usedBeforeRun,
      caseIds: cases.map(({ id }) => id),
      metrics: null,
      rawAudioPersisted: false,
      rawTranscriptsPersisted: false,
    };
  }

  const currentLedger = { schemaVersion: 1, buckets: { ...(budgetLedger.buckets ?? {}) } };
  const completed = { baseline: [], context: [] };
  const audioSha256 = {};
  const requests = [];
  let stop = false;

  for (const testCase of cases) {
    const mime = audioMimeType(testCase.audioFile);
    if (!mime) throw new TypeError(`unsupported audio fixture extension for ${testCase.id}`);
    const audio = fs.readFileSync(path.join(audioDirectory, testCase.audioFile));
    audioSha256[testCase.id] = createHash("sha256").update(audio).digest("hex");
    const audioData = `data:${mime};base64,${audio.toString("base64")}`;
    const language = testCase.lang === "en-AU" ? "en" : testCase.lang === "zh-CN" ? "zh" : null;
    if (!language) throw new TypeError(`unsupported benchmark language for ${testCase.id}`);

    for (const variant of ["baseline", "context"]) {
      if (stop) break;
      const reservation = reserveRequestBudget(currentLedger, now());
      if (!reservation.allowed) {
        stop = true;
        requests.push({ caseId: testCase.id, variant, status: "NOT_SENT_RATE_BUDGET" });
        break;
      }
      Object.assign(currentLedger, reservation.ledger);
      persistBudgetLedger?.(currentLedger);

      const bodyBuilder = requestShape === "production" ? buildProductionAsrRequestBody : buildNativeAsrRequestBody;
      const body = bodyBuilder({
        model,
        audioData,
        language,
        entityGlossary: variant === "context" ? glossaryByLanguage[testCase.lang] : "",
      });
      const started = performance.now();
      try {
        const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/v1/provider/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45000),
        });
        const elapsedMs = Math.round(performance.now() - started);
        if (!response.ok) {
          let payload = {};
          try { payload = await response.json(); } catch { /* Keep error evidence text-free. */ }
          requests.push({ caseId: testCase.id, variant, httpStatus: response.status, providerCode: providerErrorCode(payload, response.status), elapsedMs });
          stop = true;
          break;
        }
        const payload = await response.json();
        const transcript = extractNativeTranscript(payload);
        if (!transcript?.trim()) {
          requests.push({ caseId: testCase.id, variant, httpStatus: response.status, providerCode: "empty_or_unexpected_response", elapsedMs });
          stop = true;
          break;
        }
        completed[variant].push({ caseId: testCase.id, transcript });
        requests.push({ caseId: testCase.id, variant, httpStatus: response.status, elapsedMs });
      } catch (error) {
        requests.push({ caseId: testCase.id, variant, errorType: error?.name ?? "request_error" });
        stop = true;
        break;
      }
    }
    if (stop) break;
  }

  const casesById = new Map(cases.map((testCase) => [testCase.id, testCase]));
  const baselineById = new Map(completed.baseline.map((result) => [result.caseId, result]));
  const contextById = new Map(completed.context.map((result) => [result.caseId, result]));
  const pairedCaseIds = cases.filter(({ id }) => baselineById.has(id) && contextById.has(id)).map(({ id }) => id);
  const pairedCases = pairedCaseIds.map((id) => casesById.get(id));
  const pairedResults = {
    baseline: pairedCaseIds.map((caseId) => baselineById.get(caseId)),
    context: pairedCaseIds.map((caseId) => contextById.get(caseId)),
  };
  const completePairs = pairedCaseIds.length === cases.length;
  return {
    status: completePairs ? "PAIRED_DIAGNOSTIC_COMPLETE" : (stop ? "BLOCKED" : "INCOMPLETE"),
    requestsAttempted: requests.filter((request) => request.httpStatus || request.errorType).length,
    maxRequestsPerUtcHour: MAX_ASR_REQUESTS_PER_UTC_HOUR,
    caseIds: cases.map(({ id }) => id),
    pairedCaseIds,
    audioSha256,
    completedByVariant: { baseline: completed.baseline.length, context: completed.context.length },
    requests,
    metrics: pairedCaseIds.length > 0 ? {
      baseline: evaluateTranscriptionBenchmark(pairedCases, pairedResults.baseline),
      context: evaluateTranscriptionBenchmark(pairedCases, pairedResults.context),
    } : null,
    perCaseStatistics: pairedCaseIds.length > 0 ? Object.fromEntries(
      Object.entries(pairedResults).map(([variant, results]) => [
        variant,
        results.map(({ caseId, transcript }) => evaluateTranscriptionCase(casesById.get(caseId), transcript)),
      ]),
    ) : null,
    qualityGate: "NOT_EVALUATED_DIAGNOSTIC_ONLY",
    rawAudioPersisted: false,
    rawTranscriptsPersisted: false,
  };
}

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return [];
    const index = trimmed.indexOf("=");
    if (index < 0) return [];
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    return [[key, value]];
  }));
}

function findEnvFile(startDirectory) {
  let directory = startDirectory;
  while (true) {
    const candidate = path.join(directory, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    if (!args[index].startsWith("--")) throw new TypeError(`unexpected argument: ${args[index]}`);
    const key = args[index].slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new TypeError(`missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

async function main() {
  const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(scriptRoot, options.manifest ?? ".local/ai-eval/synthetic-asr-opus128/manifest.json");
  const audioDirectory = path.resolve(scriptRoot, options["audio-dir"] ?? path.dirname(manifestPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const requestedIds = options["case-ids"]?.split(",").map((id) => id.trim()).filter(Boolean);
  const caseIds = requestedIds ?? ["en-01", "en-02", "zh-01", "zh-02"];
  if (caseIds.length * 2 > MAX_ASR_REQUESTS_PER_UTC_HOUR) throw new RangeError("this run exceeds the eight-request UTC-hour cap");
  if (new Set(caseIds).size !== caseIds.length) throw new TypeError("case IDs must be unique");
  const byId = new Map(manifest.cases.map((testCase) => [testCase.id, testCase]));
  const cases = caseIds.map((id) => {
    const testCase = byId.get(id);
    if (!testCase) throw new TypeError(`unknown case id: ${id}`);
    return testCase;
  });
  const requestShape = options["request-shape"] ?? "native";
  if (!new Set(["native", "production"]).has(requestShape)) throw new TypeError("--request-shape must be native or production");

  const envPath = findEnvFile(scriptRoot);
  const fileEnv = envPath ? parseEnv(fs.readFileSync(envPath, "utf8")) : {};
  const env = { ...fileEnv, ...process.env };
  const token = env.AI_SERVICE_TOKEN;
  const baseUrl = env.AI_SERVICE_BASE_URL || "https://ai.orithos.com.au";
  if (!token) throw new Error("AI_SERVICE_TOKEN is not configured in the process environment or an ancestor .env file");

  const budgetPath = path.resolve(scriptRoot, options["budget-file"] ?? ".local/ai-eval/asr-request-budget.json");
  fs.mkdirSync(path.dirname(budgetPath), { recursive: true });
  const budgetLockPath = `${budgetPath}.lock`;
  let budgetLock;
  try {
    budgetLock = fs.openSync(budgetLockPath, "wx");
    fs.writeSync(budgetLock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("ASR request budget is locked by another run; inspect the lock before retrying");
    throw error;
  }

  try {
    let budgetLedger = { schemaVersion: 1, buckets: {} };
    if (fs.existsSync(budgetPath)) budgetLedger = JSON.parse(fs.readFileSync(budgetPath, "utf8"));
    const persistBudgetLedger = (ledger) => {
      const temporary = `${budgetPath}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
      fs.renameSync(temporary, budgetPath);
    };

    const glossaryByLanguage = Object.fromEntries(["en-AU", "zh-CN"].map((language) => [
      language,
      [...new Set(manifest.cases.filter((testCase) => testCase.lang === language)
        .flatMap((testCase) => testCase.criticalEntities?.productIdentifiers ?? []))].join("; "),
    ]));
    const result = await runTranscriptionContextPilot({
      cases,
      audioDirectory,
      baseUrl,
      token,
      model: env.AI_GATEWAY_TRANSCRIPTION_MODEL || "qwen3-asr-flash",
      requestShape,
      glossaryByLanguage,
      budgetLedger,
      persistBudgetLedger: (ledger) => { budgetLedger = ledger; persistBudgetLedger(ledger); },
    });
    result.generatedAt = new Date().toISOString();
    result.sourceCommit = (() => {
      try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: scriptRoot, encoding: "utf8" }).trim(); }
      catch { return null; }
    })();
    result.endpointHost = new URL(baseUrl).host;
    result.model = env.AI_GATEWAY_TRANSCRIPTION_MODEL || "qwen3-asr-flash";
    result.apiMode = requestShape === "production"
      ? "POS production Chat Completions transcription shape via Gateway"
      : "native multimodal via Gateway multiModel forwarding";
    result.datasetManifestSha256 = createHash("sha256").update(fs.readFileSync(manifestPath)).digest("hex");
    result.asrConfiguration = {
      enableItn: true,
      requestShape,
      languageHints: "en for en-AU; zh for zh-CN",
      contextSource: "synthetic manifest productIdentifiers",
      variants: ["baseline", "entity glossary"],
    };

    const outputPath = path.resolve(scriptRoot, options.output ?? `.local/ai-eval/asr-context-pilot-${Date.now()}.json`);
    const allowedOutputRoot = path.resolve(scriptRoot, ".local/ai-eval") + path.sep;
    if (!outputPath.startsWith(allowedOutputRoot)) throw new TypeError("report output must be under .local/ai-eval");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    writeContextPilotReport(outputPath, result);
    process.stdout.write(`${JSON.stringify({ ...result, reportPath: path.relative(scriptRoot, outputPath) }, null, 2)}\n`);
    if (result.status !== "PAIRED_DIAGNOSTIC_COMPLETE") process.exitCode = 2;
  } finally {
    fs.closeSync(budgetLock);
    fs.unlinkSync(budgetLockPath);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.name}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
