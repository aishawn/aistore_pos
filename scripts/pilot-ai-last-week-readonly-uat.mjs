import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { safeErrorSummary } from "./lib/safe-error-summary.mjs";
import {
  assistantReportAcceptance,
  previousCompleteBusinessWeek,
} from "./ai-eval/orithos-report-assertions.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = process.env.PILOT_ENV_FILE || path.join(root, ".env");
const env = fs.existsSync(envFile)
  ? Object.fromEntries(fs.readFileSync(envFile, "utf8").split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }))
  : {};
const base = (process.env.PILOT_BASE_URL || env.DEMO_BASE_URL || "https://demo.orithos.com.au").replace(/\/+$/, "");
const isSkr = new URL(base).hostname === "skr.orithos.com.au";
const username = process.env.PILOT_USERNAME
  || (isSkr ? env.ORITHOS_SKR_USER || env.SKR_USER || "shawn"
    : env.DEMO_ADMIN_USERNAME || env.INITIAL_ADMIN_USERNAME || "admin");
const password = process.env.PILOT_PASSWORD
  || (isSkr ? env.ORITHOS_SKR_PASS || env.SKR_PASS
    : env.DEMO_ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD);
if (!password) throw new Error(isSkr ? "MISSING_SKR_PASSWORD" : "MISSING_DEMO_PASSWORD");

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const version = await fetch(`${base}/api/public/version`, { signal: AbortSignal.timeout(15000) })
  .then(async (response) => ({ status: response.status, body: await response.json().catch(() => ({})) }));
const frontendCommit = version.body.frontend?.commit ?? null;
const backendCommit = version.body.backend?.commit ?? null;
const runtimeCommit = frontendCommit && frontendCommit === backendCommit ? backendCommit : null;
const checks = [];
const add = (name, passed, evidence) => checks.push({ name, status: passed ? "PASS" : "FAIL", evidence });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
let authenticated = false;
let period = null;
try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username, password }, headers: { Origin: base }, timeout: 60000,
  });
  const body = await login.json().catch(() => ({}));
  if (!login.ok() || body.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  authenticated = true;
  add("authenticated store login", true, { status: login.status() });

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  period = previousCompleteBusinessWeek(today);
  const reportResponse = await context.request.get(
    `${base}/api/reports/native-overview?from=${period.from}&to=${period.to}`, { timeout: 60000 },
  );
  const reportBody = await reportResponse.json().catch(() => null);
  if (!reportResponse.ok() || !reportBody || (reportBody.code !== undefined && reportBody.code !== 0)) {
    throw new Error(`NATIVE_OVERVIEW_HTTP_${reportResponse.status()}`);
  }
  const report = reportBody.data ?? reportBody;
  add("native overview returned the expected complete week", report.from === period.from
    && report.to === period.to && report.reportPeriodFrom === period.from
    && report.reportPeriodTo === period.to && report.timeZone === "Australia/Adelaide"
    && Number.isFinite(Number(report.revenue)), {
    expected: period,
    actual: { from: report.from, to: report.to, timeZone: report.timeZone,
      revenue: report.revenue, dataSource: report.dataSource },
  });

  for (const [label, question] of [
    ["Chinese", "上周营业额是多少？"],
    ["English", "How much was our revenue last week?"],
  ]) {
    const response = await context.request.post(`${base}/api/ai/assistant`, {
      data: { question, surface: "ai-eval-readonly" },
      headers: { Origin: base }, timeout: 120000,
    });
    const answerBody = await response.json().catch(() => null);
    if (!response.ok() || !answerBody || (answerBody.code !== undefined && answerBody.code !== 0)) {
      add(`${label} last-week sales question completed`, false, {
        status: response.status(),
        correlationId: response.headers()["x-correlation-id"] ?? null,
        code: answerBody?.code ?? null,
        error: safeErrorSummary(answerBody?.message ?? answerBody?.error ?? "ASSISTANT_REQUEST_FAILED"),
      });
      continue;
    }
    const assistant = answerBody.data ?? answerBody;
    const result = assistantReportAcceptance(assistant, {
      ...period, intent: "report_sales", metric: "sales",
    }, report);
    add(`${label} last-week sales answer reconciles with native overview`, result.passed, {
      period,
      assistant: {
        intent: assistant.intent,
        source: assistant.source,
        llmFallback: assistant.llmFallback,
        reportPeriodFrom: assistant.reportPeriodFrom,
        reportPeriodTo: assistant.reportPeriodTo,
        dataSource: assistant.dataSource,
        storeScope: assistant.storeScope,
        reportTimeZone: assistant.reportTimeZone,
        reportDataStatus: assistant.reportDataStatus,
        answer: assistant.answer,
        checks: result.checks,
      },
      expectedRevenue: report.revenue,
      correlationId: response.headers()["x-correlation-id"] ?? null,
      writes: assistant.writeRequests ?? null,
    });
  }
} catch (error) {
  add("last-week read-only UAT completed", false, safeErrorSummary(error));
} finally {
  if (authenticated) await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await context.close();
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit,
  runtimeCommit,
  runtimeMatchesSource: runtimeCommit === sourceCommit,
  target: base,
  period,
  scope: "authenticated, read-only complete-week assistant sales reconciliation",
  writes: [],
  checks,
  passed: checks.filter((check) => check.status === "PASS").length,
  failed: checks.filter((check) => check.status === "FAIL").length,
  status: runtimeCommit !== sourceCommit ? "BLOCKED" : checks.some((check) => check.status === "FAIL") ? "FAIL" : "PASS",
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, ".local", "ai-eval", `last-week-readonly-${isSkr ? "skr" : "demo"}.json`);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, target: base, period, sourceCommit, runtimeCommit,
  status: output.status, passed: output.passed, failed: output.failed, writes: output.writes.length }));
if (output.status === "FAIL") process.exitCode = 1;
else if (output.status === "BLOCKED") process.exitCode = 2;
