import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { request } from "playwright";

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
const username = process.env.PILOT_USERNAME || "admin";
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ||
  "docs/UAT_AI_STOCK_CLARIFICATION_VARIANTS_ONLINE_CURRENT.json");

const cases = [
  ["missing-stock-en", "Why can't you find the stock?", "product name or barcode"],
  ["inventory-not-showing-en", "Why is the inventory not showing?", "product name or barcode"],
  ["anything-in-stock-en", "Why can't I find anything in stock?", "product name or barcode"],
  ["nothing-showing-en", "Nothing is showing for the stock.", "product name or barcode"],
  ["cant-find-inventory-en", "Can't find inventory", "product name or barcode"],
  ["inventory-isnt-showing-en", "Inventory isn't showing", "product name or barcode"],
  ["no-stock-showing-en", "No stock showing", "product name or barcode"],
  ["no-results-stock-en", "Why are there no results for stock?", "product name or barcode"],
  ["anything-not-found-en", "Why can't I find anything?", "product name or barcode"],
  ["nothing-comes-up-en", "Nothing comes up for inventory", "product name or barcode"],
  ["no-results-short-en", "No results for stock", "product name or barcode"],
  ["blank-stock-search-en", "The stock search is blank", "product name or barcode"],
  ["missing-stock-zh", "为什么查不到库存？", "具体商品名称或条码"],
  ["generic-missing-zh", "为什么查不到？", "具体商品名称或条码"],
  ["inventory-not-displayed-zh", "库存为什么没有显示？", "具体商品名称或条码"],
  ["inventory-cannot-see-zh", "库存看不到", "具体商品名称或条码"],
  ["product-not-displayed-zh", "商品没有显示", "具体商品名称或条码"],
  ["no-results-zh", "为什么没有结果？", "具体商品名称或条码"],
  ["nothing-found-zh", "什么都查不到", "具体商品名称或条码"],
  ["blank-stock-search-zh", "库存搜索是空白", "具体商品名称或条码"],
  ["named-unknown-product", "Do we have ORITHOS-UAT-NO-MATCH-84721 in stock?", null],
];

function writeOutput(output) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, status: output.status, passed: output.passed, blocked: output.blocked, failed: output.failed }));
}

if (!password) {
  writeOutput({ generatedAt: new Date().toISOString(), sourceCommit, target: base, scope: "assistant API only; no business writes", status: "BLOCKED", passed: 0, blocked: 1, failed: 0, checks: [{ id: "setup", status: "BLOCKED", evidence: { error: "MISSING_ADMIN_PASSWORD" } }] });
  process.exitCode = 2;
} else {
  const context = await request.newContext();
  const checks = [];
  let runtime = {};
  try {
    const login = await context.post(`${base}/api/auth/login`, {
      data: { username, password },
      headers: { Origin: base },
    });
    const loginBody = await login.json().catch(() => ({}));
    if (!login.ok() || loginBody.code !== 0) {
      throw new Error(`LOGIN_FAILED_${login.status()}_CODE_${loginBody.code ?? "missing"}_USER_${username}`);
    }

    const version = await context.get(`${base}/api/public/version`);
    runtime = await version.json().catch(() => ({}));
    for (const [id, question, answerIncludes] of cases) {
      const response = await context.post(`${base}/api/ai/assistant`, {
        data: { question },
        headers: { Origin: base },
      });
      const body = await response.json().catch(() => ({}));
      const data = body.data ?? {};
      const answer = typeof data.answer === "string" ? data.answer : "";
      const route = data.ui?.route ?? null;
      const noRoute = route === null || route === "";
      const noWrites = Array.isArray(data.writeRequests) && data.writeRequests.length === 0;
      const isNamedUnknown = id === "named-unknown-product";
      const intentOk = isNamedUnknown ? data.intent === "report_stock" : data.intent === "qa";
      const answerOk = isNamedUnknown ? true
        : answerIncludes === "product name or barcode"
          ? /product name/i.test(answer) && /barcode/i.test(answer)
          : answerIncludes === "具体商品名称或条码"
            ? /具体商品(?:名称|全称)/.test(answer) && /条码/.test(answer)
          : answer.includes(answerIncludes);
      const passed = response.ok() && body.code === 0 && intentOk && noRoute && noWrites && answerOk;
      checks.push({
        id,
        question,
        status: passed ? "PASS" : "FAIL",
        expected: isNamedUnknown
          ? { intent: "report_stock", noRoute: true, readOnly: true }
          : { intent: "qa", noRoute: true, answerIncludes, readOnly: true },
        evidence: {
          httpStatus: response.status(),
          code: body.code ?? null,
          intent: data.intent ?? null,
          route,
          answer,
          writeRequests: data.writeRequests ?? null,
          correlationId: response.headers()["x-correlation-id"] ?? null,
        },
      });
    }
  } catch (error) {
    checks.push({ id: "setup", status: "BLOCKED", evidence: { error: error instanceof Error ? error.message : "request failed" } });
  } finally {
    await context.dispose();
  }
  const output = {
    generatedAt: new Date().toISOString(),
    sourceCommit,
    target: base,
    runtimeIdentity: runtimeIdentityFrom(runtime),
    scope: "authenticated stock clarification; assistant API only; no business writes",
    selectedCount: cases.length,
    checks,
    writeRequests: ["none: assistant API only"],
    passed: checks.filter((check) => check.status === "PASS").length,
    blocked: checks.filter((check) => check.status === "BLOCKED").length,
    failed: checks.filter((check) => check.status === "FAIL").length,
  };
  output.status = output.failed ? "FAIL" : output.blocked ? "BLOCKED" : "PASS";
  writeOutput(output);
  if (output.status === "FAIL") process.exitCode = 1;
  else if (output.status === "BLOCKED") process.exitCode = 2;
}

function runtimeIdentityFrom(body) {
  const data = body?.data ?? body ?? {};
  const frontend = data.frontend ?? {};
  const backend = data.backend ?? {};
  const frontendCommit = data.frontendCommit ?? data.frontendSha ?? frontend.commit ?? null;
  const backendCommit = data.backendCommit ?? data.backendSha ?? backend.commit ?? null;
  return {
    frontendCommit,
    backendCommit,
    frontendBuiltAt: frontend.builtAt ?? null,
    backendBuiltAt: backend.builtAt ?? null,
    matchesSourceCommit: [frontendCommit, backendCommit].every((value) => value === sourceCommit),
  };
}
