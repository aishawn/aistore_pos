import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!adminPassword) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const checks = [];
let temporaryUserId = null;
let temporaryRoleId = null;

async function request(pathname, method = "GET", data) {
  const response = await context.request.fetch(`${base}${pathname}`, { method, data, headers: { Origin: base } });
  return { response, body: await response.json().catch(() => ({})) };
}
function record(name, result, evidence) { checks.push({ name, status: result ? "PASS" : "FAIL", evidence }); }

try {
  const admin = await request("/api/auth/login", "POST", { username: "admin", password: adminPassword });
  if (!admin.response.ok() || admin.body.code !== 0) throw new Error(`ADMIN_LOGIN_FAILED_${admin.response.status()}`);
  const roles = await request("/api/roles");
  const role = Array.isArray(roles.body.data)
    ? roles.body.data.find((candidate) => String(candidate.managedId ?? "").toUpperCase() === "CLERK")
    : null;
  if (!roles.response.ok() || roles.body.code !== 0 || !role?.id) {
    throw new Error(`CLERK_ROLE_LOOKUP_FAILED_${roles.response.status()}`);
  }
  const adminUser = admin.body.data?.user ?? {};
  const username = `stocktake_guard_${Date.now()}`;
  const password = `StocktakeGuard-${Date.now()}-9!x`;
  const createdUser = await request("/api/users", "POST", {
    name: "Stocktake guard temporary clerk", username, password,
    email: `${username}@example.invalid`, roleId: role.id, isAdmin: false,
    outletId: adminUser.outletId ?? null,
  });
  if (!createdUser.response.ok() || createdUser.body.code !== 0 || !createdUser.body.data?.id) {
    throw new Error(`TEMP_USER_CREATE_FAILED_${createdUser.response.status()}`);
  }
  temporaryUserId = createdUser.body.data.id;
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } });
  const clerk = await request("/api/auth/login", "POST", { username, password });
  if (!clerk.response.ok() || clerk.body.code !== 0) throw new Error(`CLERK_LOGIN_FAILED_${clerk.response.status()}`);

  const read = await request("/api/odoo/stocktake");
  record("clerk stocktake read denied", read.response.status() === 403 && read.body.code === 40300,
    `HTTP ${read.response.status()} code ${read.body.code ?? ""}`);
  const write = await request("/api/odoo/stocktake", "POST", {
    confirm: true, locationId: 1, lines: [{ productId: 1, expectedQty: 0, countedQty: 0 }],
  });
  record("clerk stocktake write denied before feature gate", write.response.status() === 403
    && write.body.code === 40300,
    `HTTP ${write.response.status()} code ${write.body.code ?? ""}; authorization is checked before the feature gate.`);
} catch (error) {
  record("stocktake access guard UAT", false, error instanceof Error ? error.message : "Unexpected failure");
} finally {
  if (temporaryUserId !== null || temporaryRoleId !== null) {
    await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
    await context.request.post(`${base}/api/auth/login`, {
      data: { username: "admin", password: adminPassword }, headers: { Origin: base },
    }).catch(() => {});
    if (temporaryUserId !== null) {
      await context.request.delete(`${base}/api/users/${temporaryUserId}`, { headers: { Origin: base } }).catch(() => {});
    }
    if (temporaryRoleId !== null) {
      await context.request.delete(`${base}/api/roles/${temporaryRoleId}`, { headers: { Origin: base } }).catch(() => {});
    }
  }
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  deployment: /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
    ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase() : "unverified-after-deploy",
  target: base,
  scope: "temporary non-admin stocktake read guard and disabled-write fail-closed check; no inventory writes",
  checks,
  status: checks.length > 0 && checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL",
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_ODOO_STOCKTAKE_ADMIN_GUARD_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length }));
if (output.status !== "PASS") process.exitCode = 1;
