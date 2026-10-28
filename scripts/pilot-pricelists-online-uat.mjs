import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
const envText = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
const env = Object.fromEntries(envText.split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
const base = (process.env.PILOT_BASE_URL ?? "https://skr.orithos.com.au").replace(/\/+$/, "");
const username = process.env.PILOT_USERNAME ?? env.PILOT_USERNAME ?? "shawn";
const password = process.env.PILOT_PASSWORD ?? env.PILOT_PASSWORD;
const marker = `Codex UAT Price List ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
const renamed = `${marker} Renamed`;
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_PRICELISTS_ONLINE_SKR_2026-10-29.json");
const checks = [];
let client;
let priceListId = null;
let writes = 0;
const record = (name, ok, detail = null) => checks.push({ name, status: ok ? "PASS" : "FAIL", ...(detail === null ? {} : { detail }) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function login() {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await client.post(`${base}/api/auth/login`, { data: { username, password }, headers: { Origin: base }, timeout: 30000 });
    const body = await response.json().catch(() => ({}));
    if (response.ok() && body.code === 0) return true;
    if (attempt < 4) await sleep(1000 * attempt);
  }
  return false;
}

async function warmSession() {
  const response = await client.get(`${base}/api/odoo/session`, { headers: { Origin: base }, timeout: 45000 });
  return response.ok();
}

async function call(method, pathname, data) {
  let response = await client.fetch(`${base}${pathname}`, { method, data, headers: { Origin: base }, timeout: 30000 });
  if (response.status() === 401 && await warmSession()) {
    response = await client.fetch(`${base}${pathname}`, { method, data, headers: { Origin: base }, timeout: 30000 });
  }
  return { response, body: await response.json().catch(() => ({})) };
}

async function list(query = marker) {
  return call("GET", `/api/odoo/pricelists?query=${encodeURIComponent(query)}&limit=100&offset=0`);
}

try {
  client = await request.newContext();
  if (!password) throw new Error("MISSING_PILOT_PASSWORD");
  record("login", await login());
  if (checks.at(-1).status !== "PASS") throw new Error("LOGIN_FAILED");
  record("Odoo session warmup", await warmSession());
  if (checks.at(-1).status !== "PASS") throw new Error("ODOO_SESSION_WARMUP_FAILED");

  let result = await call("POST", "/api/odoo/pricelists", { name: marker });
  priceListId = result.body.id;
  writes += 1;
  record("create price list", result.response.status() === 201 && Number.isSafeInteger(priceListId), { status: result.response.status() });
  if (!priceListId) throw new Error("PRICE_LIST_CREATE_FAILED");

  result = await list();
  let row = (result.body.items ?? []).find((item) => item.id === priceListId);
  record("create readback", result.response.ok() && row?.name === marker && row?.active === true, { status: result.response.status() });

  result = await call("PATCH", `/api/odoo/pricelists/${priceListId}`, { name: renamed });
  writes += 1;
  record("rename price list", result.response.ok(), { status: result.response.status() });
  result = await list(renamed);
  row = (result.body.items ?? []).find((item) => item.id === priceListId);
  record("rename readback", result.response.ok() && row?.name === renamed && row?.active === true, { status: result.response.status() });

  result = await call("DELETE", `/api/odoo/pricelists/${priceListId}`);
  writes += 1;
  record("archive price list", result.response.ok(), { status: result.response.status() });
  result = await list(renamed);
  row = (result.body.items ?? []).find((item) => item.id === priceListId);
  record("archive readback", result.response.ok() && (!row || row.active === false), { status: result.response.status() });
} catch (error) {
  record("run", false, error instanceof Error ? error.message : String(error));
} finally {
  if (client && priceListId) {
    const cleanup = await call("PATCH", `/api/odoo/pricelists/${priceListId}`, { active: false }).catch(() => null);
    const verify = await list(renamed).catch(() => null);
    const row = verify?.body?.items?.find((item) => item.id === priceListId);
    record("finally archive and verify", Boolean(cleanup && (cleanup.response.ok() || cleanup.response.status() === 404) && verify?.response.ok() && (!row || row.active === false)), {
      cleanupStatus: cleanup?.response.status() ?? null,
      verifyStatus: verify?.response.status() ?? null,
    });
  }
  await client?.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await client?.dispose();
}

const output = {
  generatedAt: new Date().toISOString(), target: base, username, marker,
  scope: "Authenticated price list create/read/rename/archive with cleanup",
  writes, cleanupVerified: checks.some((check) => check.name === "finally archive and verify" && check.status === "PASS"),
  status: checks.every((check) => check.status === "PASS"), checks,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, writes, cleanupVerified: output.cleanupVerified }));
if (!output.status) process.exitCode = 1;
