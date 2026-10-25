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

const localDatabase = (process.env.ODOO_DATABASE || env.ODOO_DATABASE || "").trim();
const expectedDatabase = (process.env.ISOLATION_ODOO_DATABASE || env.ISOLATION_ODOO_DATABASE || "").trim();
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
let result;
try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
    timeout: 30000,
  });
  const loginBody = await login.json().catch(() => ({}));
  const versionResponse = await context.request.get(`${base}/api/public/version`, { timeout: 20000 });
  const version = await versionResponse.json().catch(() => ({}));
  const uatResponse = login.ok() && loginBody.code === 0
    ? await context.request.get(`${base}/api/odoo/uat-context`, { timeout: 15000 })
    : null;
  const contextBody = uatResponse ? await uatResponse.json().catch(() => ({})) : {};
  const frontendCommit = contextBody.frontendCommit ?? version.frontend?.commit ?? null;
  const backendCommit = contextBody.backendCommit ?? version.backend?.commit ?? null;
  const runtimeMatchesSource = frontendCommit === sourceCommit && backendCommit === sourceCommit;
  const localGate = Boolean(localDatabase && expectedDatabase && localDatabase === expectedDatabase && localDatabase !== "aipos");
  const remoteGate = Boolean(uatResponse?.ok() && contextBody.isolated === true
    && contextBody.database === localDatabase && contextBody.database !== "aipos");
  result = {
    generatedAt: new Date().toISOString(),
    target: base,
    sourceCommit,
    runtime: { frontendCommit, backendCommit, matchesSourceCommit: runtimeMatchesSource },
    login: { status: login.status(), authenticated: login.ok() && loginBody.code === 0 },
    localDatabaseGate: { configured: localGate, matchesExpectedIsolation: localGate },
    remoteUatAttestation: {
      httpStatus: uatResponse?.status() ?? null,
      isolated: contextBody.isolated === true,
      databaseMatchesLocalIsolation: contextBody.database === localDatabase && Boolean(localDatabase),
      databaseNameRecorded: false,
    },
    writeGate: localGate && remoteGate && runtimeMatchesSource ? "PASS" : "BLOCKED",
    businessWrites: 0,
  };
} catch (error) {
  result = {
    generatedAt: new Date().toISOString(),
    target: base,
    sourceCommit,
    writeGate: "BLOCKED",
    detail: String(error instanceof Error ? error.message : "Unexpected error")
      .replace(/(cookie|authorization):[^\r\n]*/gi, "$1: [redacted]"),
    businessWrites: 0,
  };
} finally {
  await browser.close();
}

const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_ISOLATION_WRITE_GATE_ONLINE_READONLY.json");
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, writeGate: result.writeGate, runtime: result.runtime ?? null, remoteUatAttestation: result.remoteUatAttestation ?? null }));
if (result.writeGate !== "PASS") process.exitCode = 2;
