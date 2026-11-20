import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { reconcileRecommendationCard } from "./sommelier-recommendation-reconciliation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const expectedRuntimeCommit = process.env.PILOT_EXPECTED_RUNTIME_SHA || sourceCommit;
if (!/^[\da-f]{40}$/i.test(expectedRuntimeCommit)) throw new Error("INVALID_PILOT_EXPECTED_RUNTIME_SHA");
execFileSync("git", ["merge-base", "--is-ancestor", expectedRuntimeCommit, sourceCommit], { cwd: root, stdio: "ignore" });

let envPath = process.env.PILOT_ENV_FILE;
if (!envPath) {
  let directory = root;
  while (!fs.existsSync(path.join(directory, ".env")) && path.dirname(directory) !== directory) {
    directory = path.dirname(directory);
  }
  envPath = path.join(directory, ".env");
}
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
const isSkr = new URL(base).hostname === "skr.orithos.com.au";
const username = process.env.PILOT_USERNAME || (isSkr ? env.ORITHOS_SKR_USER || env.SKR_USER || "shawn" : "admin");
const password = process.env.PILOT_PASSWORD || (isSkr
  ? env.ORITHOS_SKR_PASS || env.SKR_PASS
  : env.INITIAL_ADMIN_PASSWORD);
if (!password) throw new Error(isSkr ? "MISSING_SKR_PASSWORD" : "MISSING_ADMIN_PASSWORD");

const reportPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, ".local", "ai-eval", `sommelier-recommend-${new Date().toISOString().replace(/[-:.]/g, "")}.json`);
const nonWineTerms = /\b(?:beer|ale|lager|ipa|stout|cider|vodka|rum|whisky|whiskey|gin|tequila|brandy|liqueur|limoncello|vermouth|schnapps|sake|soju|mezcal|bourbon|scotch|cognac|armagnac)\b/i;
const checks = [];
const record = (id, status, evidence = {}) => checks.push({ id, status, evidence });
const cookieJar = new Map();
async function apiRequest(method, url, { data, headers = {} } = {}) {
  const requestHeaders = new Headers(headers);
  if (data !== undefined) requestHeaders.set("content-type", "application/json");
  const cookieHeader = [...cookieJar].map(([name, value]) => `${name}=${value}`).join("; ");
  if (cookieHeader && !requestHeaders.has("cookie")) requestHeaders.set("cookie", cookieHeader);
  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  for (const setCookie of response.headers.getSetCookie()) {
    const pair = setCookie.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator < 1) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (value) cookieJar.set(name, value);
    else cookieJar.delete(name);
  }
  const responseBody = await response.text();
  return {
    status: () => response.status,
    ok: () => response.ok,
    json: async () => JSON.parse(responseBody),
  };
}
const context = {
  get: (url) => apiRequest("GET", url),
  post: (url, options) => apiRequest("POST", url, options),
};

try {
  const versionResponse = await context.get(`${base}/api/public/version`);
  const versionBody = await versionResponse.json().catch(() => ({}));
  const version = versionBody.data ?? versionBody;
  const runtimeCommit = version.backend?.commit ?? version.backend?.sourceCommit ?? null;
  const runtimeMatches = versionResponse.ok()
    && runtimeCommit?.toLowerCase() === expectedRuntimeCommit.toLowerCase()
    && version.frontend?.commit?.toLowerCase() === expectedRuntimeCommit.toLowerCase();
  record("runtime-identity", runtimeMatches ? "PASS" : "BLOCKED", {
    runtimeCommit,
    expectedRuntimeCommit,
    frontendCommit: version.frontend?.commit ?? null,
  });
  if (!runtimeMatches) throw new Error("RUNTIME_SHA_MISMATCH");

  const login = await context.post(`${base}/api/auth/login`, {
    data: { username, password },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  record("authenticated-read-session", "PASS");

  const identifyResponse = await context.get(`${base}/api/ai/sommelier/identify?q=Shiraz`);
  const identifyBody = await identifyResponse.json().catch(() => ({}));
  const identified = identifyBody.data?.items ?? [];
  const identifyPassed = identifyResponse.ok() && identifyBody.code === 0 && identified.length > 0;
  record("identify-shiraz", identifyPassed ? "PASS" : "FAIL", { count: identified.length });

  const budgetMax = 100;
  const recommendationResponse = await context.post(`${base}/api/ai/sommelier/recommend`, {
    data: {
      wineType: "red",
      budgetMin: 0,
      budgetMax,
      dryness: 0.5,
      body: 0.5,
      fruitiness: 0.5,
      oak: 0.5,
      tannin: 0.5,
      food: ["steak"],
      occasion: "UAT read-only",
    },
    headers: { Origin: base },
  });
  const recommendationBody = await recommendationResponse.json().catch(() => ({}));
  const cards = recommendationBody.data?.recommendations ?? [];
  const requestPassed = recommendationResponse.ok() && recommendationBody.code === 0 && cards.length > 0;
  record("recommendation-returned", requestPassed ? "PASS" : "FAIL", {
    count: cards.length,
    emptyReason: recommendationBody.data?.emptyReason ?? null,
  });
  if (!requestPassed) throw new Error("RECOMMENDATION_EMPTY_OR_UNAVAILABLE");

  const cardsWithInferenceFlag = cards.filter((card) => typeof card.inferred === "boolean").length;
  const inferredCount = cards.filter((card) => card.inferred === true).length;
  const inferenceProvenancePassed = cardsWithInferenceFlag === cards.length;
  record("recommendation-inference-provenance", inferenceProvenancePassed ? "PASS" : "FAIL", {
    cards: cards.length,
    cardsWithInferenceFlag,
    inferredCount,
  });

  const uniqueProducts = new Set(cards.map((card) => card.productId)).size === cards.length;
  const allRedWine = cards.every((card) => card.wineType?.toLowerCase() === "red" && !nonWineTerms.test(card.name ?? ""));
  const allInBudgetAndStock = cards.every((card) => Number(card.sellPrice) >= 0
    && Number(card.sellPrice) <= budgetMax
    && Number(card.stockQuantity) > 0);
  record("all-results-match-red-wine-request", allRedWine ? "PASS" : "FAIL", {
    rejected: cards.filter((card) => card.wineType?.toLowerCase() !== "red" || nonWineTerms.test(card.name ?? ""))
      .map((card) => ({ productId: card.productId, name: card.name, wineType: card.wineType })),
  });
  record("unique-in-stock-within-budget", uniqueProducts && allInBudgetAndStock ? "PASS" : "FAIL", {
    uniqueProducts,
    allInBudgetAndStock,
  });

  const catalogMatches = [];
  for (const card of cards) {
    const response = await context.get(`${base}/api/ai/sommelier/wines/${card.productId}`);
    const body = await response.json().catch(() => ({}));
    const catalogWine = body.data;
    catalogMatches.push(response.ok() && body.code === 0
      && catalogWine?.name === card.name
      && reconcileRecommendationCard(card, catalogWine));
  }
  record("recommendation-price-promotion-stock-match-current-catalog", catalogMatches.every(Boolean) ? "PASS" : "FAIL", {
    matched: catalogMatches.filter(Boolean).length,
    compared: cards.length,
  });
} catch (error) {
  if (error instanceof Error && error.message === "RUNTIME_SHA_MISMATCH") {
    // The runtime check already contains the diagnostic evidence.
  } else {
    record("setup", "FAIL", { errorType: error instanceof Error ? error.name : "UnknownError" });
  }
} finally {
  try { await context.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); } catch { /* Session expires normally. */ }
  cookieJar.clear();
}

const passed = checks.filter((check) => check.status === "PASS").length;
const failed = checks.filter((check) => check.status === "FAIL").length;
const blocked = checks.filter((check) => check.status === "BLOCKED").length;
const report = {
  generatedAt: new Date().toISOString(),
  sourceCommit,
  expectedRuntimeCommit,
  target: base,
  scope: "deterministic Sommelier identify/recommendation and read-only product identity checks; no provider/model calls or business writes",
  checks,
  passed,
  failed,
  blocked,
  status: failed ? "FAIL" : blocked ? "BLOCKED" : "PASS",
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath, status: report.status, passed, failed, blocked }));
if (report.status === "FAIL") process.exitCode = 1;
else if (report.status === "BLOCKED") process.exitCode = 2;
