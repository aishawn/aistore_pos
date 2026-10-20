import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const env = fs.existsSync(envPath)
  ? Object.fromEntries(fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }))
  : {};
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const checks = [];
const record = (id, status, evidence) => checks.push({ id, status, evidence });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();

async function getJson(url, label) {
  const response = await context.request.get(url, { headers: { Origin: base }, timeout: 60000 });
  const body = await response.json().catch(() => ({}));
  return { response, body, data: body.data ?? null, label };
}

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
    timeout: 60000,
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  record("AUTH-01", "PASS", `HTTP ${login.status()}`);

  const config = await getJson(`${base}/api/ai/config/client`, "AI_CONFIG");
  record("CFG-01", config.response.ok() && config.body.code === 0 ? "PASS" : "FAIL",
    config.response.ok() && config.body.code === 0
      ? `enabled=${config.data?.enabled}; assistantAvailable=${config.data?.assistantAvailable}`
      : `HTTP ${config.response.status()} code=${config.body.code ?? "missing"}`);

  const threads = await getJson(`${base}/api/ai/threads`, "THREADS");
  const rows = Array.isArray(threads.data) ? threads.data : [];
  const validRows = rows.every((row) => Number.isFinite(Number(row.id))
    && typeof row.sessionKey === "string" && row.sessionKey.length > 0
    && typeof row.title === "string");
  record("HIST-01", threads.response.ok() && threads.body.code === 0 && validRows ? "PASS" : "FAIL",
    `HTTP ${threads.response.status()} count=${rows.length} metadataValid=${validRows}`);

  if (rows[0]) {
    const detail = await getJson(`${base}/api/ai/threads/${encodeURIComponent(rows[0].id)}`, "THREAD_DETAIL");
    const data = detail.data ?? {};
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const validMessages = messages.every((message) => ["user", "assistant"].includes(message.role)
      && typeof message.text === "string");
    const sameThread = String(data.id) === String(rows[0].id)
      && data.sessionKey === rows[0].sessionKey;
    record("HIST-02", detail.response.ok() && detail.body.code === 0 && sameThread && validMessages ? "PASS" : "FAIL",
      `HTTP ${detail.response.status()} messages=${messages.length} sameThread=${sameThread} messageShapeValid=${validMessages}; content omitted`);
  } else {
    record("HIST-02", "BLOCKED", "No existing thread is available to open; creating a new AI turn is outside this read-only check.");
  }
  record("HIST-03", "BLOCKED", "A second store-user credential is unavailable; cross-user thread isolation was not exercised.");

  const metrics = await getJson(`${base}/api/ai/metrics?hours=24`, "STORE_METRICS");
  const metricsJson = JSON.stringify(metrics.data ?? {});
  const hasAggregateShape = Number(metrics.data?.windowHours) === 24
    && metrics.data?.summary && Array.isArray(metrics.data?.byPath);
  record("MET-S01", metrics.response.ok() && metrics.body.code === 0 && hasAggregateShape ? "PASS" : "FAIL",
    `HTTP ${metrics.response.status()} windowHours=${metrics.data?.windowHours ?? "missing"} paths=${metrics.data?.byPath?.length ?? 0}`);
  const noConversationText = !/"(?:question|answer|textContent|sql)"\s*:/i.test(metricsJson);
  record("MET-S02", noConversationText ? "PASS" : "FAIL",
    `aggregateOnly=${noConversationText}; payloadLength=${metricsJson.length}`);

  for (const [id, route] of [
    ["MET-S03", "/api/platform/metrics/ai?hours=24"],
    ["MET-S04", "/api/platform/metrics/ai/stores/1?hours=24"],
  ]) {
    const response = await context.request.get(`${base}${route}`, { headers: { Origin: base }, timeout: 60000 });
    const body = await response.json().catch(() => ({}));
    const denied = response.status() === 403 || body.code === 40300;
    record(id, denied ? "PASS" : "FAIL", `store-admin platform access HTTP ${response.status()} code=${body.code ?? "missing"}`);
  }
  record("MET-P01", "BLOCKED", "Platform-operator credentials are unavailable; cross-store usage UI was not opened.");

  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } });
  const anonymous = await context.request.get(`${base}/api/ai/threads`, { headers: { Origin: base } });
  record("AUTH-02", anonymous.status() === 401 ? "PASS" : "FAIL", `anonymous thread list HTTP ${anonymous.status()}`);
} catch (error) {
  const detail = error instanceof Error ? error.message : "Unexpected failure";
  const blocked = /LOGIN_FAILED_(?:502|503|504)|(?:ECONNRESET|ETIMEDOUT)/i.test(detail);
  record("SETUP", blocked ? "BLOCKED" : "FAIL", detail);
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await context.close();
  await browser.close();
}

const failed = checks.filter((check) => check.status === "FAIL").length;
const blocked = checks.filter((check) => check.status === "BLOCKED").length;
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  deploymentShaVerified: false,
  runtimeCommit: null,
  target: base,
  scope: "authenticated read-only History, store metrics and platform access checks; no business or AI configuration writes",
  writeBusinessData: false,
  checks,
  passed: checks.filter((check) => check.status === "PASS").length,
  blocked,
  failed,
  status: failed ? "FAIL" : blocked ? "BLOCKED" : "PASS",
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", `UAT_AI_FOLLOWUP_HISTORY_PLATFORM_${new Date().toISOString().slice(0, 10)}.json`);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: output.passed, blocked, failed }));
if (failed) process.exitCode = 1;
else if (blocked) process.exitCode = 2;
