import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!adminPassword) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const checks = [];
let temporaryUserId = null;
let temporaryRoleId = null;
let temporaryUsername = null;
let clerkPassword = null;

async function jsonRequest(pathname, method = "GET", data) {
  const response = await context.request.fetch(`${base}${pathname}`, {
    method,
    data,
    headers: { Origin: base },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function record(name, status, evidence) {
  checks.push({ name, status, evidence });
}

try {
  const adminLogin = await jsonRequest("/api/auth/login", "POST", {
    username: "admin",
    password: adminPassword,
  });
  if (!adminLogin.response.ok() || adminLogin.body.code !== 0) {
    throw new Error(`ADMIN_LOGIN_FAILED_${adminLogin.response.status()}`);
  }

  const roles = await jsonRequest("/api/roles");
  let role = Array.isArray(roles.body.data)
    ? roles.body.data.find((item) => !item.managedId) ?? roles.body.data[0]
    : null;
  if (!role?.id) {
    const roleCreate = await jsonRequest("/api/roles", "POST", {
      name: `AI guard temporary role ${Date.now()}`,
      permissionIds: [],
    });
    if (!roleCreate.response.ok() || roleCreate.body.code !== 0 || !roleCreate.body.data?.id) {
      throw new Error(`TEMP_ROLE_CREATE_FAILED_${roleCreate.response.status()}_${roleCreate.body.message ?? ""}`);
    }
    role = roleCreate.body.data;
    temporaryRoleId = role.id;
  }

  const adminUser = adminLogin.body.data?.user ?? {};
  temporaryUsername = `ai_guard_${Date.now()}`;
  clerkPassword = `AiGuard-${Date.now()}-9!x`;
  const create = await jsonRequest("/api/users", "POST", {
    name: "AI guard temporary clerk",
    username: temporaryUsername,
    password: clerkPassword,
    email: `${temporaryUsername}@example.invalid`,
    roleId: role.id,
    isAdmin: false,
    outletId: adminUser.outletId ?? null,
  });
  if (!create.response.ok() || create.body.code !== 0 || !create.body.data?.id) {
    throw new Error(`TEMP_USER_CREATE_FAILED_${create.response.status()}_${create.body.message ?? ""}`);
  }
  temporaryUserId = create.body.data.id;

  const before = await Promise.all([
    jsonRequest("/api/ai/config/intents"),
    jsonRequest("/api/ai/config/slots"),
    jsonRequest("/api/ai/config/slot-values"),
    jsonRequest("/api/ai/config/prompts"),
  ]);
  const beforeCounts = before.map((item) => Array.isArray(item.body.data) ? item.body.data.length : null);

  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } });
  const clerkLogin = await jsonRequest("/api/auth/login", "POST", {
    username: temporaryUsername,
    password: clerkPassword,
  });
  if (!clerkLogin.response.ok() || clerkLogin.body.code !== 0) {
    throw new Error(`CLERK_LOGIN_FAILED_${clerkLogin.response.status()}`);
  }

  const writeCases = [
    ["reload", "POST", "/api/ai/config/reload", {}],
    ["create intent", "POST", "/api/ai/config/intents", { code: `guard_${Date.now()}`, name: "Guard", enabled: true }],
    ["update intent", "PUT", "/api/ai/config/intents/1", { code: "guard_update", name: "Guard", enabled: true }],
    ["delete intent", "DELETE", "/api/ai/config/intents/1"],
    ["create slot", "POST", "/api/ai/config/slots", { code: `guard_slot_${Date.now()}`, name: "Guard", valueType: "string" }],
    ["update slot", "PUT", "/api/ai/config/slots/1", { code: "guard_slot_update", name: "Guard", valueType: "string" }],
    ["delete slot", "DELETE", "/api/ai/config/slots/1"],
    ["create slot value", "POST", "/api/ai/config/slot-values", { slotCode: "guard", valueKey: "guard", value: "guard" }],
    ["update slot value", "PUT", "/api/ai/config/slot-values/1", { slotCode: "guard", valueKey: "guard", value: "guard" }],
    ["delete slot value", "DELETE", "/api/ai/config/slot-values/1"],
    ["create prompt", "POST", "/api/ai/config/prompts", { code: `guard_prompt_${Date.now()}`, name: "Guard", content: "guard" }],
    ["update prompt", "PUT", "/api/ai/config/prompts/1", { code: "guard_prompt_update", name: "Guard", content: "guard" }],
    ["delete prompt", "DELETE", "/api/ai/config/prompts/1"],
  ];

  let denied = 0;
  for (const [name, method, pathname, data] of writeCases) {
    const result = await jsonRequest(pathname, method, data);
    // This API uses the project's uniform business envelope: authorization failures
    // are HTTP 200 with business code 40300, rather than an HTTP 403 response.
    const passed = result.response.ok() && result.body.code === 40300;
    if (passed) denied += 1;
    record(`clerk ${name}`, passed ? "PASS" : "FAIL", `HTTP ${result.response.status()} code ${result.body.code ?? ""}`);
  }
  record("all AI config writes denied", denied === writeCases.length ? "PASS" : "FAIL", `${denied}/${writeCases.length} returned HTTP 200 with business code 40300.`);

  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } });
  const adminAgain = await jsonRequest("/api/auth/login", "POST", { username: "admin", password: adminPassword });
  if (!adminAgain.response.ok() || adminAgain.body.code !== 0) throw new Error(`ADMIN_RELOGIN_FAILED_${adminAgain.response.status()}`);
  const after = await Promise.all([
    jsonRequest("/api/ai/config/intents"),
    jsonRequest("/api/ai/config/slots"),
    jsonRequest("/api/ai/config/slot-values"),
    jsonRequest("/api/ai/config/prompts"),
  ]);
  const afterCounts = after.map((item) => Array.isArray(item.body.data) ? item.body.data.length : null);
  const unchanged = beforeCounts.every((count, index) => count !== null && count === afterCounts[index]);
  record("AI config counts unchanged", unchanged ? "PASS" : "FAIL", `${JSON.stringify(beforeCounts)} -> ${JSON.stringify(afterCounts)}`);
} catch (error) {
  record("AI admin guard UAT", "FAIL", error instanceof Error ? error.message : "Unexpected failure");
} finally {
  if (temporaryUserId !== null || temporaryRoleId !== null) {
    await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
    await context.request.post(`${base}/api/auth/login`, {
      data: { username: "admin", password: adminPassword },
      headers: { Origin: base },
    }).catch(() => {});
    if (temporaryUserId !== null) {
      await context.request.delete(`${base}/api/users/${temporaryUserId}`, { headers: { Origin: base } }).catch(() => {});
    }
  }
  if (temporaryRoleId !== null) {
    await context.request.delete(`${base}/api/roles/${temporaryRoleId}`, { headers: { Origin: base } }).catch(() => {});
  }
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  deployment: /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
    ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase()
    : "unverified-after-deploy",
  target: base,
  scope: "temporary non-admin user AI configuration write guard; no business writes",
  checks,
  status: checks.length > 0 && checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL",
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_ADMIN_GUARD_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length }));
if (output.status !== "PASS") process.exitCode = 1;
