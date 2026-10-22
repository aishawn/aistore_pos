import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const env = fs.existsSync(envPath)
  ? Object.fromEntries(fs.readFileSync(envPath, "utf8").split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }))
  : {};
const base = (process.env.PILOT_BASE_URL || "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const checks = [];
const record = (id, status, evidence) => checks.push({ id, status, evidence });
try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
    timeout: 60000,
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  const first = await context.request.post(`${base}/api/ai/assistant`, {
    data: { question: "sales last 7 days", surface: "sell" },
    headers: { Origin: base },
    timeout: 120000,
  });
  const firstBody = await first.json().catch(() => ({}));
  const firstData = firstBody.data ?? {};
  const threadId = typeof firstData.threadId === "string" ? firstData.threadId : null;
  const firstOk = first.ok() && firstBody.code === 0 && threadId && firstData.intent === "report_sales"
    && Array.isArray(firstData.writeRequests) && firstData.writeRequests.length === 0;
  record("followup-seed", firstOk ? "PASS" : "FAIL", {
    httpStatus: first.status(),
    intent: firstData.intent ?? null,
    threadIdPresent: Boolean(threadId),
    writeRequests: firstData.writeRequests ?? null,
  });

  if (threadId) {
    const second = await context.request.post(`${base}/api/ai/assistant`, {
      data: { question: "and yesterday?", threadId, surface: "sell" },
      headers: { Origin: base },
      timeout: 120000,
    });
    const secondBody = await second.json().catch(() => ({}));
    const secondData = secondBody.data ?? {};
    const answer = String(secondData.answer ?? "");
    const secondOk = second.ok() && secondBody.code === 0
      && secondData.threadId === threadId
      && secondData.intent === "report_sales"
      && answer.length > 0
      && /sales|revenue|takings|turnover|销售额|营业额|流水|收入/i.test(answer)
      && Array.isArray(secondData.writeRequests) && secondData.writeRequests.length === 0;
    record("followup-yesterday", secondOk ? "PASS" : "FAIL", {
      httpStatus: second.status(),
      intent: secondData.intent ?? null,
      sameThread: secondData.threadId === threadId,
      answerPresent: answer.length > 0,
      writeRequests: secondData.writeRequests ?? null,
    });
  } else {
    record("followup-yesterday", "BLOCKED", "Seed response did not return a thread id.");
  }
} catch (error) {
  record("setup", "FAIL", error instanceof Error ? error.message : "Unexpected failure");
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await context.close();
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  target: base,
  scope: "authenticated same-thread follow-up; assistant API only; no business writes",
  checks,
  passed: checks.filter((check) => check.status === "PASS").length,
  blocked: checks.filter((check) => check.status === "BLOCKED").length,
  failed: checks.filter((check) => check.status === "FAIL").length,
  writeRequests: [],
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_FOLLOWUP_ONLINE.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: output.passed, blocked: output.blocked, failed: output.failed }));
if (output.failed) process.exitCode = 1;
