import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const deploymentVerified = process.env.PILOT_DEPLOYMENT_VERIFIED === "true"
  && /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "");
const runtimeCommit = deploymentVerified ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase() : null;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const evidence = {
  generatedAt: new Date().toISOString(),
  sourceCommit,
  deploymentShaVerified: deploymentVerified,
  runtimeCommit,
  target: base,
  scope: "admin-only AI report metrics read-only regression; no business or configuration writes",
  checks: [],
  writes: [],
};
const record = (name, status, detail = "") => evidence.checks.push({ name, status, detail });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
    timeout: 60000,
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  record("admin login", "PASS", `status=${login.status()}`);

  const assistant = await context.request.post(`${base}/api/ai/assistant`, {
    data: { question: "look up products" },
    headers: { Origin: base },
    timeout: 120000,
  });
  const assistantBody = await assistant.json().catch(() => ({}));
  const assistantIntent = assistantBody?.data?.intent;
  const assistantOk = assistant.ok() && assistantBody?.code === 0 && typeof assistantIntent === "string" && assistantIntent.length > 0;
  record("assistant audit seed", assistantOk ? "PASS" : "FAIL", assistantOk ? `intent=${assistantIntent}` : `status=${assistant.status()} code=${assistantBody?.code ?? "missing"}`);

  const metrics = await context.request.get(`${base}/api/ai/metrics?hours=24`, { headers: { Origin: base }, timeout: 60000 });
  const metricsBody = await metrics.json().catch(() => ({}));
  const summary = metricsBody?.data?.summary;
  const hasRequests = Number(summary?.requests) > 0;
  const valid = metrics.ok()
    && metricsBody?.code === 0
    && Number(metricsBody?.data?.windowHours) === 24
    && Number.isFinite(Number(summary?.allowedRate))
    && Number.isFinite(Number(summary?.averageLatencyMs))
    && (!hasRequests || (Number.isFinite(Number(summary?.p50LatencyMs)) && Number.isFinite(Number(summary?.p95LatencyMs))))
    && Number.isFinite(Number(summary?.estimatedTokens))
    && summary?.estimatedTokensOnly === true
    && Array.isArray(metricsBody?.data?.byPath);
  record("admin metrics response", valid ? "PASS" : "FAIL", valid
    ? `status=${metrics.status()} paths=${metricsBody.data.byPath.length} p50=${summary.p50LatencyMs ?? "null"} p95=${summary.p95LatencyMs ?? "null"}`
    : `status=${metrics.status()} code=${metricsBody?.code ?? "missing"}`);

  const expectedAssistantPath = assistantOk ? `assistant:${assistantIntent}` : "";
  const assistantPath = metricsBody?.data?.byPath?.find((item) => item?.path === expectedAssistantPath);
  const assistantPathValid = assistantOk
    && assistantPath
    && Number(assistantPath.requests) > 0
    && Number(assistantPath.allowed) > 0
    && Number.isFinite(Number(assistantPath.p50LatencyMs))
    && Number.isFinite(Number(assistantPath.p95LatencyMs))
    && Number(assistantPath.estimatedTokens) > 0;
  record("assistant intent metrics coverage", assistantPathValid ? "PASS" : "FAIL", assistantPathValid
    ? `${assistantPath.path} requests=${assistantPath.requests} allowed=${assistantPath.allowed} p50=${assistantPath.p50LatencyMs} p95=${assistantPath.p95LatencyMs} estimatedTokens=${assistantPath.estimatedTokens}`
    : `expected ${expectedAssistantPath || "assistant:<intent>"} path or estimated tokens missing`);

  const anonymousContext = await browser.newContext();
  const anonymous = await anonymousContext.request.get(`${base}/api/ai/metrics?hours=24`, { headers: { Origin: base }, timeout: 60000 });
  record("anonymous metrics guard", anonymous.status() === 401 ? "PASS" : "FAIL", `status=${anonymous.status()}`);
  await anonymousContext.close();

  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const page = await context.newPage({ viewport });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${base}/reports/ai/metrics`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: "AI query metrics" }).waitFor({ timeout: 60000 });
    const table = await page.getByRole("heading", { name: "By AI path" }).isVisible().catch(() => false);
    record(`metrics UI ${viewport.width}px`, pageErrors.length === 0 && table ? "PASS" : "FAIL", `table=${table} pageErrors=${pageErrors.length}`);
    const tableSemantics = await page.locator("table caption").count() === 1
        && await page.locator("table thead th[scope=col]").count() === 8
      && await page.locator("main[aria-busy]").count() === 1;
    record(`metrics accessibility ${viewport.width}px`, pageErrors.length === 0 && tableSemantics ? "PASS" : "FAIL", `caption=${await page.locator("table caption").count()} scopedHeaders=${await page.locator("table thead th[scope=col]").count()} busy=${await page.locator("main[aria-busy]").count()}`);
    await page.close();
  }

  evidence.status = evidence.checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL";
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await context.close();
  await browser.close();
}

const output = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", `UAT_AI_METRICS_ONLINE_${new Date().toISOString().replaceAll(/[:.]/g, "-")}.json`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
if (evidence.status !== "PASS") process.exitCode = 1;
