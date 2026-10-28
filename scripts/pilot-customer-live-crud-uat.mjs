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
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const username = process.env.PILOT_USERNAME ?? "admin";
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
const marker = `Codex UAT Customer ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
const updatedName = `${marker} Updated`;
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_CUSTOMER_LIVE_CRUD_CURRENT.json");
const checks = [];
let client;
let customerId = null;
let writes = 0;
const record = (name, status, detail = null) => checks.push({ name, status: status === true ? "PASS" : status === false ? "FAIL" : status, ...(detail === null ? {} : { detail }) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function login() {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await client.post(`${base}/api/auth/login`, { data: { username, password }, headers: { Origin: base }, timeout: 30000 });
    const body = await response.json().catch(() => ({}));
    if (response.ok() && body.code === 0) return true;
    if (attempt < 5) await sleep(1000 * attempt);
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

async function search(query) {
  return call("POST", "/api/odoo/records", { type: "customers", query, limit: 100, offset: 0 });
}

try {
  client = await request.newContext();
  if (!password) throw new Error("MISSING_ADMIN_PASSWORD");
  record("login", await login() ? "PASS" : "FAIL");
  if (checks.at(-1).status !== "PASS") throw new Error("LOGIN_FAILED");
  record("Odoo session warmup", await warmSession() ? "PASS" : "FAIL");
  if (checks.at(-1).status !== "PASS") throw new Error("ODOO_SESSION_WARMUP_FAILED");

  let result = await call("POST", "/api/odoo/customers", { name: marker, email: `${Date.now()}@example.invalid`, phone: "0400000000", ref: "CODEX-UAT" });
  customerId = result.body.id;
  writes += 1;
  record("create customer", result.response.status() === 201 && Number.isSafeInteger(customerId), result.response.status());
  if (!customerId) throw new Error("CUSTOMER_CREATE_FAILED");

  result = await search(marker);
  let row = (result.body.items ?? []).find((item) => item.id === customerId);
  record("create readback", result.response.ok() && row?.name === marker && row?.active === true, result.response.status());

  result = await call("PATCH", `/api/odoo/customers/${customerId}`, { name: updatedName, city: "Adelaide", ref: "CODEX-UAT-UPDATED" });
  writes += 1;
  record("update customer", result.response.ok(), result.response.status());
  result = await search(updatedName);
  row = (result.body.items ?? []).find((item) => item.id === customerId);
  record("update readback", result.response.ok() && row?.name === updatedName && row?.city === "Adelaide" && row?.active === true, result.response.status());

  result = await call("DELETE", `/api/odoo/customers/${customerId}`);
  writes += 1;
  record("archive customer", result.response.ok(), result.response.status());
  result = await search(updatedName);
  row = (result.body.items ?? []).find((item) => item.id === customerId);
  record("archive readback", result.response.ok() && (!row || row.active === false), result.response.status());
} catch (error) {
  record("run", "FAIL", error instanceof Error ? error.message : "Unexpected failure");
} finally {
  if (client && customerId) {
    const cleanup = await call("DELETE", `/api/odoo/customers/${customerId}`);
    const verify = await search(updatedName);
    const row = (verify.body.items ?? []).find((item) => item.id === customerId);
    const cleanupIdempotent = cleanup.response.ok() || cleanup.response.status() === 404;
    record("finally archive and verify", cleanupIdempotent && verify.response.ok() && (!row || row.active === false) ? "PASS" : "FAIL", { cleanupStatus: cleanup.response.status(), verifyStatus: verify.response.status() });
  }
  await client?.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await client?.dispose();
}

const output = { generatedAt: new Date().toISOString(), target: base, username, marker, scope: "Authenticated customer create/read/update/archive with automatic session retry and cleanup", writes, cleanupVerified: checks.some((check) => check.name === "finally archive and verify" && check.status === "PASS"), status: checks.every((check) => check.status === "PASS"), checks };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, writes, cleanupVerified: output.cleanupVerified }));
if (!output.status) process.exitCode = 1;
