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
const base = (process.env.PILOT_BASE_URL || "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const cases = [
  { id: "replenishment-en", question: "What should I reorder today?", intent: "navigate", route: "/stock/replenishment" },
  { id: "replenishment-colloquial-en", question: "What should we buy before the weekend?", intent: "navigate", route: "/stock/replenishment" },
  { id: "replenishment-zh", question: "给我今天的补货建议", intent: "navigate", route: "/stock/replenishment" },
  { id: "replenishment-alert-zh", question: "库存预警有哪些", intent: "navigate", route: "/stock/replenishment" },
  { id: "pricing-en", question: "Which prices should I review?", intent: "navigate", route: "/stock/capped-pricing" },
  { id: "pricing-colloquial-en", question: "What should I charge for Shiraz?", intent: "navigate", route: "/stock/capped-pricing" },
  { id: "pricing-zh", question: "帮我看看哪些商品需要调价", intent: "navigate", route: "/stock/capped-pricing" },
  { id: "recommendation-en", question: "Recommend a red wine under $30", intent: "navigate", route: "/sommelier" },
  { id: "recommendation-colloquial-en", question: "What wine goes with steak?", intent: "navigate", route: "/sommelier" },
  { id: "recommendation-zh", question: "推荐适合聚会的白葡萄酒", intent: "navigate", route: "/sommelier" },
  { id: "invoice-en", question: "Scan this supplier invoice", intent: "navigate", route: "/invoices/scan" },
  { id: "invoice-colloquial-en", question: "Upload this supplier bill", intent: "navigate", route: "/invoices/scan" },
  { id: "invoice-zh", question: "识别这张发票", intent: "navigate", route: "/invoices/scan" },
  { id: "store-question-en", question: "What did we sell most this week?", intent: "report_adhoc" },
  { id: "store-question-zh", question: "本周哪类商品卖得最好", intent: "report_adhoc" },
  { id: "report-negative-wine", question: "How much red wine sold this week?", intent: "report_qty" },
  { id: "report-negative-invoice", question: "How many invoices did we receive?", intent: "report_adhoc" },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const checks = [];
const writeRequests = [];

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password }, headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
  if (!accessCookie || !loginBody.data?.user) throw new Error("LOGIN_SESSION_MISSING");

  const configResponse = await context.request.get(`${base}/api/ai/config/client`);
  const configBody = await configResponse.json().catch(() => ({}));
  const config = configBody.data ?? {};
  if (!configResponse.ok() || configBody.code !== 0) throw new Error(`AI_CONFIG_FAILED_${configResponse.status()}`);

  for (const item of cases) {
    const response = await context.request.post(`${base}/api/ai/assistant`, {
      data: { question: item.question },
      headers: { Origin: base },
    });
    const body = await response.json().catch(() => ({}));
    const data = body.data ?? {};
    const route = data.ui?.route ?? null;
    const passed = response.ok()
      && body.code === 0
      && data.intent === item.intent
      && (item.route ? route === item.route : true);
    checks.push({
      id: item.id,
      question: item.question,
      status: passed ? "PASS" : "FAIL",
      evidence: { httpStatus: response.status(), code: body.code, intent: data.intent ?? null, route },
    });
  }

  // The API-only matrix cannot execute a UI action. Keep a conservative marker
  // so this evidence never claims that a purchase, price or receive was written.
  writeRequests.push("none: assistant API only");
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } });
  const output = {
    generatedAt: new Date().toISOString(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    deployment: /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
      ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase()
      : "unverified-after-deploy",
    target: base,
    config: {
      enabled: config.enabled ?? null,
      assistantAvailable: config.assistantAvailable ?? null,
    },
    scope: "authenticated natural-language workflow routing; assistant API only; no business writes",
    checks,
    writeRequests,
    passed: checks.filter((check) => check.status === "PASS").length,
    failed: checks.filter((check) => check.status === "FAIL").length,
    status: checks.length > 0 && checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL",
  };
  const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
    ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
    : path.join(root, "docs", "UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-20.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, status: output.status, passed: output.passed, failed: output.failed }));
  if (output.status !== "PASS") process.exitCode = 1;
} catch (error) {
  const output = {
    generatedAt: new Date().toISOString(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    target: base,
    scope: "authenticated natural-language workflow routing; assistant API only; no business writes",
    checks: [{ id: "setup", status: "FAIL", evidence: { error: error instanceof Error ? error.message : "Unexpected failure" } }],
    writeRequests,
    passed: 0,
    failed: 1,
    status: "FAIL",
  };
  const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
    ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
    : path.join(root, "docs", "UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-20.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.error(JSON.stringify({ outputPath, status: output.status, failed: 1 }));
  process.exitCode = 1;
} finally {
  await browser.close();
}
