import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { reconcileAiReportMetrics } from "./ai-report-metric-reconciliation.mjs";
import { assistantRuntimePreflight } from "./ai-eval/stock-clarification-acceptance.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.PILOT_BASE_URL || "https://skr.orithos.com.au").replace(/\/+$/, "");
const question = process.env.PILOT_QUESTION || "sales last 7 days";
const chinese = /[\u3400-\u9fff]/.test(question);
const isSkr = new URL(base).hostname === "skr.orithos.com.au";
const username = process.env.PILOT_USERNAME || (isSkr ? process.env.ORITHOS_SKR_USER : "admin");
const password = process.env.PILOT_PASSWORD || (isSkr ? process.env.ORITHOS_SKR_PASS : process.env.INITIAL_ADMIN_PASSWORD);
const playwrightEntry = process.env.CODEX_NODE_MODULES
  ? path.join(process.env.CODEX_NODE_MODULES, "playwright", "index.mjs")
  : null;
if (!username || !password) throw new Error("Store credentials are required through environment variables");
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const runtimeResponse = await fetch(`${base}/api/public/version`, { signal: AbortSignal.timeout(15000) });
const runtime = runtimeResponse.ok ? await runtimeResponse.json().catch(() => null) : null;
const runtimePreflight = assistantRuntimePreflight(runtime, sourceCommit);
if (!runtimePreflight.allowed) {
  const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
    ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
    : path.join(root, ".local", "ai-eval", "assistant-provenance-ui-current.json");
  const blockedReport = {
    generatedAt: new Date().toISOString(),
    sourceCommit,
    target: base,
    scope: "browser provenance UAT preflight; no login or assistant query sent",
    runtimeIdentity: runtimePreflight,
    checks: [{ name: "runtime identity", status: "BLOCKED" }],
    result: "BLOCKED",
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(blockedReport, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, result: "BLOCKED", reason: runtimePreflight.reason }));
  process.exit(2);
}
const { chromium } = playwrightEntry && fs.existsSync(playwrightEntry)
  ? await import(pathToFileURL(playwrightEntry).href)
  : await import("playwright");

const browser = await chromium.launch({
  headless: true,
  ...(process.env.PILOT_BROWSER_EXECUTABLE_PATH
    ? { executablePath: process.env.PILOT_BROWSER_EXECUTABLE_PATH }
    : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
let assistantResponse = null;
let checks = [];

function isoDate(value) {
  const text = String(value ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(text);
  if (iso) {
    const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return date.getUTCFullYear() === Number(iso[1])
      && date.getUTCMonth() === Number(iso[2]) - 1
      && date.getUTCDate() === Number(iso[3]) ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
  }
  const localized = /^(\d{1,2})\s+([A-Za-z]{3})\.?\s+(\d{4})$/.exec(text);
  if (!localized) return null;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    .indexOf(localized[2].toLowerCase());
  if (month < 0) return null;
  const day = Number(localized[1]);
  const year = Number(localized[3]);
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day
    ? `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;
}

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username, password },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
  if (!accessCookie || !loginBody.data?.user) throw new Error("LOGIN_SESSION_MISSING");

  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("sf_token", token);
    localStorage.setItem("sf_user", JSON.stringify(user));
  }, { token: accessCookie.value, user: loginBody.data.user });

  const page = await context.newPage();
  page.on("response", async (response) => {
    const request = response.request();
    if (request.method() !== "POST" || new URL(response.url()).pathname !== "/api/ai/assistant") return;
    const body = await response.json().catch(() => null);
    assistantResponse = body?.data ?? body;
  });
  await page.goto(`${base}/assistant`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  const composer = page.getByRole("textbox", { name: "Ask Orithos AI" });
  await composer.waitFor({ state: "visible", timeout: 30_000 });
  await composer.fill(question);
  await page.getByRole("button", { name: "Send message" }).click({ timeout: 30_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("p")].some((node) => {
    const text = node.textContent || "";
    return text.includes("Source:") || text.includes("Data source:") || text.includes("数据来源");
  }), { timeout: 120_000 });

  const metadataBlocks = (await page.locator("p").allTextContents())
    .map((text) => text.trim())
    .filter((text) => text.includes("Source:") || text.includes("Data source:") || text.includes("数据来源"));
  const visibleMetadata = metadataBlocks.at(-1) ?? null;
  const hasDataSource = chinese
    ? /数据来源[：:]\s*orithos_ledger/i.test(visibleMetadata ?? "")
    : /Data source:\s*orithos_ledger/i.test(visibleMetadata ?? "");
  const hasRequestedRange = chinese
    ? /查询范围[：:]\s*\d{4}-\d{2}-\d{2}(?: to \d{4}-\d{2}-\d{2})?/i.test(visibleMetadata ?? "")
    : /Requested: \d{4}-\d{2}-\d{2}(?: to \d{4}-\d{2}-\d{2})?/i.test(visibleMetadata ?? "");
  const hasLatestReturnedDate = chinese
    ? /最新返回销售日[：:]\s*\d{4}-\d{2}-\d{2}/.test(visibleMetadata ?? "")
    : /Latest returned sales date: \d{4}-\d{2}-\d{2}/i.test(visibleMetadata ?? "");
  const rows = Array.isArray(assistantResponse?.table?.rows) ? assistantResponse.table.rows : [];
  const dates = rows.map((row) => isoDate(row.date ?? row.Date)).filter(Boolean).sort();
  const disclosesMissingDates = rows.length === 0
    ? chinese ? /没有返回销售行/.test(visibleMetadata ?? "") : /No sales rows returned/i.test(visibleMetadata ?? "")
    : chinese
      ? /已返回销售数据，但没有可识别的逐日日期/.test(visibleMetadata ?? "")
      : /Sales data was returned without readable daily dates/i.test(visibleMetadata ?? "");
  const dateCoverageHonest = dates.length > 0 ? hasLatestReturnedDate : disclosesMissingDates;
  const requestRange = assistantResponse?.slots?.from && assistantResponse?.slots?.to
    ? { from: assistantResponse.slots.from, to: assistantResponse.slots.to }
    : null;
  let overview = null;
  if (requestRange) {
    const query = new URLSearchParams(requestRange);
    const overviewResponse = await context.request.get(`${base}/api/reports/native-overview?${query}`);
    const overviewBody = await overviewResponse.json().catch(() => ({}));
    overview = overviewResponse.ok() && overviewBody.code === 0 ? overviewBody.data : null;
  }
  const answerMetrics = rows[0] ?? null;
  const metricsReconcile = reconcileAiReportMetrics(answerMetrics, overview);
  const noWrites = Array.isArray(assistantResponse?.writeRequests)
    && assistantResponse.writeRequests.length === 0;
  const metadataComplete = (chinese ? /报表期间[：:]/ : /Report period:/i).test(visibleMetadata ?? "")
    && (chinese ? /时区[：:]/ : /Timezone:/i).test(visibleMetadata ?? "")
    && (chinese ? /数据状态[：:]/ : /Data status:/i).test(visibleMetadata ?? "")
    && (chinese ? /数据时间[：:]/ : /Data timestamp:/i).test(visibleMetadata ?? "");
  checks = [
    { name: "AI answer displays Orithos as the underlying data source", status: hasDataSource ? "PASS" : "FAIL" },
    { name: "AI answer displays the requested date range", status: hasRequestedRange ? "PASS" : "FAIL" },
    { name: "AI answer displays API period, timezone, status and timestamp", status: metadataComplete ? "PASS" : "FAIL" },
    { name: "AI response uses deterministic routing", status: assistantResponse?.source === "deterministic" ? "PASS" : "FAIL" },
    { name: "AI answer dates match the returned row shape or disclose their absence", status: dateCoverageHonest ? "PASS" : "FAIL" },
    { name: "AI sales and transactions reconcile; gross profit matches or is accurately unavailable", status: metricsReconcile ? "PASS" : "FAIL" },
    { name: "AI response requests no business writes", status: noWrites ? "PASS" : "FAIL" },
  ];
  const summary = {
    generatedAt: new Date().toISOString(),
    sourceCommit,
    target: base,
    runtimeIdentity: runtimePreflight,
    runtime: {
      frontendCommit: runtime?.frontend?.commit ?? null,
      backendCommit: runtime?.backend?.commit ?? null,
      frontendBuiltAt: runtime?.frontend?.builtAt ?? null,
      backendBuiltAt: runtime?.backend?.builtAt ?? null,
    },
    scope: "Authenticated browser AI sales query; auth and assistant requests only; no business writes",
    readOnly: true,
    businessWrites: 0,
    query: {
      question,
      httpIntent: assistantResponse?.intent ?? null,
      routeSource: assistantResponse?.source ?? null,
      dataAsOf: assistantResponse?.dataAsOf ?? null,
      requestedRange: {
        from: assistantResponse?.slots?.from ?? null,
        to: assistantResponse?.slots?.to ?? null,
      },
      returnedDateRange: { from: dates[0] ?? null, to: dates.at(-1) ?? null },
      rowCount: rows.length,
      answerMetrics,
      overviewMetrics: overview ? {
        revenue: overview.revenue ?? null,
        grossProfit: overview.grossProfit ?? null,
        transactions: overview.transactions ?? null,
      } : null,
      writeRequests: assistantResponse?.writeRequests ?? null,
    },
    visibleMetadata,
    checks,
    result: checks.every((check) => check.status === "PASS") ? "PASS" : "REVIEW",
  };
  const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
    ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
    : path.join(root, ".local", "ai-eval", "assistant-provenance-ui-current.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, result: summary.result, checks, query: summary.query, visibleMetadata }, null, 2));
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await context.close();
  await browser.close();
}
