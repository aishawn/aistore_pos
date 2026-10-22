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

const cases = [
  { id: "product-count", question: "How many products do we have?", type: "product_count", route: "/products", answerPattern: /\b\d+\b/ },
  { id: "product-count-zh", question: "商品总数", type: "product_count", route: "/products", answerPattern: /\d+/ },
  { id: "replenishment", question: "What should I restock?", type: "replenishment", route: "/stock/replenishment" },
  { id: "pricing", question: "Which prices should I review?", type: "pricing", route: "/stock/capped-pricing" },
  { id: "sommelier", question: "Recommend a red wine under $30", type: "sommelier", route: "/sommelier" },
  { id: "guided-customer", question: "Create a customer", type: "guided_action", route: "/customers" },
  { id: "guided-product-edit", question: "编辑这个产品", type: "guided_action", route: "/products" },
  { id: "guided-receive", question: "Receive this stock", type: "guided_action", route: "/stock/replenishment" },
  { id: "guided-price-save", question: "保存这些价格", type: "guided_action", route: "/stock/capped-pricing" },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const checks = [];
let runtime = {};
try {
  runtime = await context.request.get(`${base}/api/public/version`).then((response) => response.json());
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  for (const item of cases) {
    const response = await context.request.post(`${base}/api/ai/assistant`, {
      data: { question: item.question, surface: "sell" },
      headers: { Origin: base },
      timeout: 120000,
    });
    const body = await response.json().catch(() => ({}));
    const data = body.data ?? {};
    const cards = Array.isArray(data.cards) ? data.cards : [];
    const card = cards.find((candidate) => candidate?.type === item.type);
    const passed = response.ok()
      && body.code === 0
      && Boolean(card)
      && card.status !== "unavailable"
      && card.ctaRoute === item.route
      && (!item.answerPattern || item.answerPattern.test(String(data.answer ?? "")))
      && Array.isArray(data.writeRequests)
      && data.writeRequests.length === 0;
    checks.push({
      id: item.id,
      question: item.question,
      status: passed ? "PASS" : "FAIL",
      httpStatus: response.status(),
      intent: data.intent ?? null,
      card: card ?? null,
      writeRequests: data.writeRequests ?? null,
    });
  }
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await context.close();
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  runtimeCommit: runtime.frontend?.commit === runtime.backend?.commit ? runtime.backend.commit : null,
  target: base,
  scope: "authenticated assistant API-only card contract; no business writes",
  checks,
  passed: checks.filter((check) => check.status === "PASS").length,
  failed: checks.filter((check) => check.status === "FAIL").length,
  writeRequests: ["none: assistant API only"],
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_CARD_CONTRACT_ONLINE.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: output.passed, failed: output.failed, runtimeCommit: output.runtimeCommit }));
if (output.failed) process.exitCode = 1;
