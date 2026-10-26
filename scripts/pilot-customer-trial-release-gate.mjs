import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const localEnv = fs.existsSync(envPath)
  ? Object.fromEntries(fs.readFileSync(envPath, "utf8").split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }))
  : {};

const env = (name, fallback = "") => (process.env[name] ?? localEnv[name] ?? fallback).trim();
const base = env("PILOT_BASE_URL", "https://demo.orithos.com.au").replace(/\/+$/, "");
const expectedCommit = env("PILOT_EXPECTED_SOURCE_COMMIT");
const expectedEnvironment = env("PILOT_EXPECTED_ENVIRONMENT", "production");
const requireUat = env("PILOT_REQUIRE_UAT", "false").toLowerCase() === "true";
const password = env("INITIAL_ADMIN_PASSWORD");

if (!/^[a-f0-9]{40}$/.test(expectedCommit)) {
  throw new Error("Set PILOT_EXPECTED_SOURCE_COMMIT to the full candidate SHA.");
}
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");
const url = new URL(base);
if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)
  && !url.hostname.endsWith(".localhost")) {
  throw new Error("Use HTTPS for remote verification.");
}

const configuredDatabase = env("ODOO_DATABASE");
const isolationDatabase = env("ISOLATION_ODOO_DATABASE");
const databaseSeparated = Boolean(configuredDatabase && isolationDatabase
  && configuredDatabase !== isolationDatabase);
const outputPath = process.env.PILOT_EVIDENCE_FILE
  ? path.resolve(root, process.env.PILOT_EVIDENCE_FILE)
  : path.join(root, "docs", `UAT_CUSTOMER_TRIAL_RELEASE_GATE_${Date.now()}.json`);
const report = {
  generatedAt: new Date().toISOString(),
  target: url.origin,
  expectedCommit,
  expectedEnvironment,
  scope: "release identity, database separation and parked-sale read; no business writes",
  status: "BLOCKED",
  deploymentShaVerified: false,
  databaseSeparation: { configured: Boolean(configuredDatabase && isolationDatabase), distinct: databaseSeparated },
  login: { authenticated: false, status: null },
  parkedSaleRead: { attempted: false, status: null, success: false },
  uatAttestation: { attempted: false, status: null, isolated: false },
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
    timeout: 30_000,
  });
  const loginBody = await login.json().catch(() => ({}));
  report.login = { authenticated: login.ok() && loginBody.code === 0, status: login.status() };

  const versionResponse = await context.request.get(`${base}/api/public/version`, { timeout: 20_000 });
  const version = await versionResponse.json().catch(() => ({}));
  report.deploymentShaVerified = ["frontend", "backend"].every((name) =>
    version[name]?.service === `orithos-${name}`
    && version[name]?.commit === expectedCommit
    && Number.isFinite(Date.parse(version[name]?.builtAt)));

  if (report.login.authenticated) {
    report.parkedSaleRead.attempted = true;
    const parked = await context.request.get(`${base}/api/sell/parked`, { timeout: 20_000 });
    const parkedBody = await parked.json().catch(() => ({}));
    report.parkedSaleRead = {
      attempted: true,
      status: parked.status(),
      success: parked.ok() && parkedBody.code === 0,
    };

    report.uatAttestation.attempted = true;
    const uat = await context.request.get(`${base}/api/public/uat-context`, { timeout: 15_000 });
    const uatBody = await uat.json().catch(() => ({}));
    report.uatAttestation = {
      attempted: true,
      status: uat.status(),
      isolated: uat.ok() && uatBody.isolated === true,
    };
  }
} catch (error) {
  report.error = String(error instanceof Error ? error.message : "Unexpected error")
    .replace(/(cookie|authorization|password):[^\r\n]*/gi, "$1: [redacted]");
} finally {
  await browser.close();
}

const productionGate = expectedEnvironment === "production"
  && report.deploymentShaVerified
  && report.login.authenticated
  && report.parkedSaleRead.success
  && report.databaseSeparation.distinct;
const uatGate = expectedEnvironment === "uat"
  && requireUat
  && report.deploymentShaVerified
  && report.login.authenticated
  && report.parkedSaleRead.success
  && report.uatAttestation.isolated;
report.status = productionGate || uatGate ? "PASS" : "BLOCKED";

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  status: report.status,
  deploymentShaVerified: report.deploymentShaVerified,
  databaseSeparated: report.databaseSeparation.distinct,
  parkedSaleRead: report.parkedSaleRead,
  uatIsolated: report.uatAttestation.isolated,
}));
if (report.status !== "PASS") process.exitCode = 2;
