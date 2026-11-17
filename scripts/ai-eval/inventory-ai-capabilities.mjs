/**
 * Read-only inventory: seeded intents and live AI configuration per target.
 *
 * Usage:
 *   node scripts/ai-eval/inventory-ai-capabilities.mjs
 *   $env:PILOT_BASE_URLS = "https://demo.orithos.com.au,https://skr.orithos.com.au"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { compareIntentCodes, parseSeedIntents } from "./capability-alignment.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const seedPath = path.join(root, "pos-api", "src", "main", "resources", "db", "seed_ai_intent.sql");
const capabilitiesPath = path.join(root, "pos-api", "docs", "AI_QUESTION_CAPABILITIES.md");

const SEED_EXPECTED_INTENTS = [
  "report_sales", "report_qty", "report_aov", "report_stock", "report_dead_stock", "report_adhoc",
  "report_stock_value", "product_count",
  "search_product", "search_customer", "navigate", "guided_action", "entity_action", "sale_action", "qa", "unknown",
];
/** Intents documented in AI_QUESTION_CAPABILITIES; all should appear in seed_ai_intent INSERT rows. */
const RUNTIME_ONLY_INTENTS = [];

function loadEnv() {
  let envDirectory = root;
  while (!fs.existsSync(path.join(envDirectory, ".env")) && path.dirname(envDirectory) !== envDirectory) {
    envDirectory = path.dirname(envDirectory);
  }
  const envPath = path.join(envDirectory, ".env");
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }));
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, { headers: { Accept: "application/json" }, ...init });
  const body = await response.json().catch(() => null);
  const cookie = response.headers.getSetCookie?.()
    ?.map((row) => row.split(";")[0])
    .join("; ");
  return { ok: response.ok, status: response.status, body, cookie };
}

async function probeTarget(base, credentials) {
  const normalized = base.replace(/\/+$/, "");
  let cookie = "";
  if (credentials?.username && credentials?.password) {
    const login = await fetchJson(`${normalized}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: normalized },
      body: JSON.stringify({ username: credentials.username, password: credentials.password }),
    });
    if (login.body?.code === 0) cookie = login.cookie ?? "";
  }
  const authHeaders = cookie ? { cookie, Origin: normalized } : {};
  const [configRes, versionRes, intentsRes] = await Promise.all([
    fetchJson(`${normalized}/api/ai/config/client`, { headers: authHeaders }),
    fetchJson(`${normalized}/api/public/version`),
    fetchJson(`${normalized}/api/ai/config/intents`, { headers: authHeaders }),
  ]);
  const config = configRes.body?.code === 0 ? configRes.body.data ?? {} : null;
  const version = versionRes.body?.code === 0 ? versionRes.body.data ?? versionRes.body : versionRes.body;
  const intents = intentsRes.body?.code === 0 ? intentsRes.body.data ?? [] : [];
  if (cookie) {
    await fetchJson(`${normalized}/api/auth/logout`, {
      method: "POST",
      headers: { Origin: normalized, cookie },
    }).catch(() => null);
  }
  return {
    target: normalized,
    authenticated: Boolean(cookie),
    configHttp: configRes.status,
    config,
    intentHttp: intentsRes.status,
    intentCodes: Array.isArray(intents) ? intents.map((intent) => intent.code).filter(Boolean).sort() : [],
    versionHttp: versionRes.status,
    backendCommit: version?.commit ?? version?.backend?.commit ?? null,
    builtAt: version?.builtAt ?? version?.backend?.builtAt ?? null,
  };
}

const seedIntents = parseSeedIntents(fs.readFileSync(seedPath, "utf8"));
const allContractIntents = [...SEED_EXPECTED_INTENTS, ...RUNTIME_ONLY_INTENTS];
const missingInSeed = SEED_EXPECTED_INTENTS.filter((code) => !seedIntents.includes(code));
const extraInSeed = seedIntents.filter((code) => !allContractIntents.includes(code));
const capabilitiesPresent = fs.existsSync(capabilitiesPath);

const targets = (process.env.PILOT_BASE_URLS ?? "https://demo.orithos.com.au,https://skr.orithos.com.au")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const env = loadEnv();
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const runtimeProbes = [];
for (const target of targets) {
  const isSkr = new URL(target).hostname === "skr.orithos.com.au";
  const credentials = isSkr
    ? { username: env.ORITHOS_SKR_USER ?? env.SKR_USER ?? "shawn", password: env.ORITHOS_SKR_PASS ?? env.SKR_PASS }
    : { username: "admin", password: process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD };
  try {
    const probe = await probeTarget(target, credentials.password ? credentials : null);
    runtimeProbes.push({
      ...probe,
      intentAlignment: compareIntentCodes(allContractIntents, probe.intentCodes ?? []),
    });
  } catch (error) {
    runtimeProbes.push({
      target,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  sourceCommit,
  capabilitiesDoc: { path: path.relative(root, capabilitiesPath), present: capabilitiesPresent },
  contractIntents: allContractIntents,
  runtimeOnlyIntents: RUNTIME_ONLY_INTENTS,
  seedIntents,
  alignment: {
    missingInSeed,
    extraInSeed,
    seedMatchesContract: missingInSeed.length === 0,
    liveTargetsMatchSeed: runtimeProbes.length === targets.length
      && runtimeProbes.every((probe) => probe.authenticated && probe.intentHttp === 200
        && probe.intentAlignment?.matches === true),
  },
  runtimeProbes,
  status: missingInSeed.length === 0 && capabilitiesPresent
    && runtimeProbes.length === targets.length
    && runtimeProbes.every((probe) => probe.authenticated && probe.intentHttp === 200
      && probe.intentAlignment?.matches === true) ? "PASS" : "WARN",
};

const outDir = path.join(root, ".local", "ai-eval");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "inventory-capabilities.json");
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  outPath,
  status: report.status,
  missingInSeed,
  liveTargetsMatchSeed: report.alignment.liveTargetsMatchSeed,
  targets: targets.length,
}));
if (missingInSeed.length > 0 || !report.alignment.liveTargetsMatchSeed) process.exitCode = 1;
