/**
 * Aggregate PASS/FAIL/BLOCKED and safety/latency metrics from UAT JSON reports.
 *
 * Usage:
 *   node scripts/ai-eval/summarize-uat-reports.mjs docs/UAT_AI_WORKFLOW_*.json
 *   node scripts/ai-eval/summarize-uat-reports.mjs --glob docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_*.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);

function expandInputs(argv) {
  const files = [];
  for (const arg of argv) {
    if (arg === "--glob") continue;
    const pattern = arg.includes("*") ? arg : null;
    if (pattern) {
      const dir = path.dirname(pattern);
      const base = path.basename(pattern);
      const searchDir = path.isAbsolute(dir) ? dir : path.join(root, dir);
      for (const name of fs.readdirSync(searchDir)) {
        if (base.replace(/\*/g, ".*").match(new RegExp(`^${base.replace(/\./g, "\\.").replace(/\*/g, ".*")}$`))) {
          files.push(path.join(searchDir, name));
        }
      }
      continue;
    }
    const resolved = path.isAbsolute(arg) ? arg : path.join(root, arg);
    if (fs.existsSync(resolved)) files.push(resolved);
  }
  if (files.length === 0 && argv[0] === "--glob" && argv[1]) {
    const pattern = path.isAbsolute(argv[1]) ? argv[1] : path.join(root, argv[1]);
    const dir = path.dirname(pattern);
    const tail = path.basename(pattern);
    const re = new RegExp(`^${tail.replace(/\./g, "\\.").replace(/\*/g, ".*")}$`);
    for (const name of fs.readdirSync(dir)) {
      if (re.test(name)) files.push(path.join(dir, name));
    }
  }
  return [...new Set(files)].sort();
}

function summarizeChecks(checks = []) {
  let deterministicRoute = 0;
  let writeSafety = 0;
  let llmFallback = 0;
  const latencies = [];
  for (const check of checks) {
    const ev = check.evidence ?? {};
    if (ev.source === "deterministic" && ev.llmFallback === false) deterministicRoute += 1;
    if (ev.llmFallback === true) llmFallback += 1;
    if (ev.writeRequestsCheck === true || (Array.isArray(ev.writeRequests) && ev.writeRequests.length === 0)) {
      writeSafety += 1;
    }
    if (Number.isFinite(ev.assistantElapsedMs)) latencies.push(ev.assistantElapsedMs);
  }
  latencies.sort((a, b) => a - b);
  const p50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : null;
  const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : null;
  return { deterministicRoute, writeSafety, llmFallback, assistantSamples: latencies.length, p50LatencyMs: p50, p95LatencyMs: p95 };
}

const defaultInputs = [
  path.join(root, ".local", "ai-eval", "UAT_WORKFLOW_DEMO_SMOKE.json"),
  path.join(root, ".local", "ai-eval", "UAT_WORKFLOW_SKR_SMOKE.json"),
];
const inputFiles = expandInputs(args.length ? args : defaultInputs);
const byTarget = {};
const failuresById = {};

for (const file of inputFiles) {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    continue;
  }
  const target = payload.target ?? "unknown";
  const row = byTarget[target] ?? {
    files: [],
    passed: 0,
    failed: 0,
    blocked: 0,
    checks: { PASS: 0, FAIL: 0, BLOCKED: 0 },
    ...summarizeChecks([]),
  };
  row.files.push(path.relative(root, file));
  row.passed += Number(payload.passed ?? 0);
  row.failed += Number(payload.failed ?? 0);
  row.blocked += Number(payload.blocked ?? 0);
  for (const check of payload.checks ?? []) {
    row.checks[check.status] = (row.checks[check.status] ?? 0) + 1;
    if (check.status === "FAIL") {
      failuresById[check.id] = failuresById[check.id] ?? [];
      failuresById[check.id].push({ target, file: path.basename(file) });
    }
  }
  const extra = summarizeChecks(payload.checks);
  row.deterministicRoute += extra.deterministicRoute;
  row.writeSafety += extra.writeSafety;
  row.llmFallback += extra.llmFallback;
  row.assistantSamples += extra.assistantSamples;
  if (extra.p95LatencyMs != null) {
    row.p95LatencyMs = row.p95LatencyMs == null ? extra.p95LatencyMs : Math.max(row.p95LatencyMs, extra.p95LatencyMs);
  }
  if (extra.p50LatencyMs != null) {
    row.p50LatencyMs = row.p50LatencyMs == null ? extra.p50LatencyMs : Math.round((row.p50LatencyMs + extra.p50LatencyMs) / 2);
  }
  byTarget[target] = row;
}

const totals = Object.values(byTarget).reduce(
  (acc, row) => {
    acc.passed += row.passed;
    acc.failed += row.failed;
    acc.blocked += row.blocked;
    return acc;
  },
  { passed: 0, failed: 0, blocked: 0 },
);
const scored = totals.passed + totals.failed;
const passRate = scored > 0 ? totals.passed / scored : null;

const readonlyPath = path.join(root, ".local", "ai-eval", "UAT_REPORT_READONLY_SKR.json");
let readonlyVerification = null;
if (fs.existsSync(readonlyPath)) {
  try {
    const payload = JSON.parse(fs.readFileSync(readonlyPath, "utf8"));
    const traces = ["salesQuestion", "averageSaleQuestion", "exactDateSalesQuestion", "weeklySalesQuestion"]
      .map((key) => payload[key]?.traceability)
      .filter(Boolean);
    readonlyVerification = {
      path: path.relative(root, readonlyPath),
      summary: payload.summary ?? null,
      nativeOverviewReconciliation: {
        yesterdayRevenueMatch: payload.salesQuestion?.assistantRevenueMatch ?? null,
        exactDateRevenueMatch: payload.exactDateSalesQuestion?.assistantRevenueMatch ?? null,
        weeklyRevenueMatch: payload.weeklySalesQuestion?.assistantRevenueMatch ?? null,
        deterministicRouteCount: traces.filter((t) => t.deterministicRoute).length,
        writeSafetyCount: traces.filter((t) => t.writeSafety).length,
      },
    };
  } catch {
    readonlyVerification = { path: path.relative(root, readonlyPath), error: "parse_failed" };
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  inputCount: inputFiles.length,
  totals: { ...totals, passRate, excludedBlocked: totals.blocked },
  byTarget,
  uniqueFailureIds: Object.keys(failuresById).sort(),
  failuresById,
  readonlyVerification,
};

const outPath = path.join(root, ".local", "ai-eval", "uat-summary.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({
  outPath,
  inputCount: inputFiles.length,
  passRate,
  passed: totals.passed,
  failed: totals.failed,
  blocked: totals.blocked,
}));