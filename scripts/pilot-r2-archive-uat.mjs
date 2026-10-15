import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = "https://demo.orithos.com.au";
const subdomain = process.env.PILOT_SUBDOMAIN || env.PILOT_SUBDOMAIN || "demo";
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const checks = [];
const record = (name, status, evidence) => checks.push({ name, status, evidence });
let safeStatus = null;

try {
  const anonymous = await context.request.get(`${base}/api/r2-archive/status`);
  if (anonymous.status() !== 401) throw new Error(`Anonymous archive status was not rejected (HTTP ${anonymous.status()})`);
  record("Unauthenticated status is rejected", "PASS", "GET /api/r2-archive/status returns HTTP 401 without an Orithos session.");

  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
    headers: { Origin: base, "X-Orithos-Tenant-Slug": subdomain },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error("Orithos admin login failed");
  record("Orithos admin login", "PASS", "Authenticated using the same-origin login API.");

  const response = await context.request.get(`${base}/api/r2-archive/status`);
  const envelope = await response.json().catch(() => ({}));
  if (!response.ok() || envelope.code !== 0 || typeof envelope.data?.configured !== "boolean") {
    throw new Error(`Admin archive status unavailable (HTTP ${response.status()})`);
  }
  const data = envelope.data;
  safeStatus = {
    configured: data.configured,
    state: data.state,
    scheduleEnabled: data.scheduleEnabled ?? null,
    workerScheduleEnabled: data.workerScheduleEnabled ?? null,
    scheduleTime: data.scheduleTime ?? null,
    nextRunAt: data.nextRunAt ?? null,
    nextAttemptAt: data.nextAttemptAt ?? null,
    timezone: data.timezone ?? null,
  };
  if (Object.keys(data).some((key) => /secret|access.?key|credential|endpoint|bucket/i.test(key))) {
    throw new Error("Archive status response includes a credential/configuration field");
  }
  if (data.state === "success" && data.snapshot?.databaseIntegrity !== "ok") {
    throw new Error("Successful snapshot does not report SQLite integrity=ok");
  }
  const files = data.snapshot?.files ?? [];
  if (data.state === "success") {
    if (!files.some((file) => file.name === "shopfront.sqlite3")) throw new Error("Verified snapshot is missing shopfront.sqlite3");
    if (!files.some((file) => file.name === "manifest.json")) throw new Error("Verified snapshot is missing manifest.json");
    if (files.some((file) => !Number.isFinite(file.sizeBytes) || file.sizeBytes <= 0 || !/^[a-f0-9]{64}$/i.test(file.sha256 ?? ""))) {
      throw new Error("A verified snapshot file has an invalid size or SHA-256");
    }
  }
  if (data.scheduleEnabled !== false || data.workerScheduleEnabled !== false || data.scheduleTime !== null || data.nextRunAt !== null || data.nextAttemptAt !== null) {
    throw new Error(`R2 sync is not in manual-only mode: ${JSON.stringify(safeStatus)}`);
  }
  safeStatus = {
    configured: data.configured,
    state: data.state,
    reason: data.reason ?? null,
    lastSuccessAt: data.lastSuccessAt ?? null,
    nextRunAt: data.nextRunAt ?? null,
    nextAttemptAt: data.nextAttemptAt ?? null,
    timezone: data.timezone ?? null,
    scheduleEnabled: data.scheduleEnabled,
    workerScheduleEnabled: data.workerScheduleEnabled ?? null,
    snapshotId: data.snapshotId ?? null,
    snapshot: data.snapshot ? {
      syncedAt: data.snapshot.syncedAt ?? null,
      manifestSha256: data.snapshot.manifestSha256 ?? null,
      databaseIntegrity: data.snapshot.databaseIntegrity ?? null,
      files,
    } : null,
    snapshotFileCount: files.length,
    databaseIntegrity: data.snapshot?.databaseIntegrity ?? null,
    lastErrorCode: data.lastErrorCode ?? null,
  };
  record("Admin status is safe and valid", "PASS", `configured=${data.configured}; state=${data.state}; no secret fields returned.`);

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}/settings/integrations`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: "Shopfront archive mirror" }).waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Sync now" }).waitFor({ timeout: 10000 });
    await page.getByText("Manual only", { exact: true }).waitFor({ timeout: 30000 });
    const pageState = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      text: document.querySelector("main")?.innerText ?? document.body.innerText,
    }));
    if (pageState.scrollWidth > pageState.width + 1) throw new Error(`Integration page overflows at ${width}px`);
    if (!pageState.text.includes("Shopfront archive mirror")) throw new Error(`Archive card missing at ${width}px`);
    if (!pageState.text.includes("Manual only") || !pageState.text.includes("Not scheduled")) {
      throw new Error(`Manual-only schedule state is not visible at ${width}px: ${pageState.text.slice(-900)}`);
    }
    if (!data.configured && await page.getByRole("button", { name: "Sync now" }).isEnabled()) {
      throw new Error("Sync now is enabled when R2 credentials are not configured");
    }
    record(`Integration card layout ${width}px`, "PASS", "Manual-only card visible without horizontal overflow; no sync was triggered.");
  }

  if (!data.configured) {
    record("Credentials-not-configured state", "PASS", "UI leaves manual sync disabled until private R2 credentials are configured.");
  }
} catch (error) {
  record("R2 archive production UAT", "FAIL", error instanceof Error ? error.message : "Unexpected failure");
} finally {
  try { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); } catch { /* token expires normally */ }
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  deployment: process.env.PILOT_DEPLOYMENT_SHA || null,
  sourceCommit,
  scope: "production read-only R2 mirror integration status, authentication and responsive UI; no sync trigger or Odoo business writes",
  checks,
  status: safeStatus,
};
const outputPath = path.join(root, "docs", "UAT_R2_ARCHIVE_2026-10-14.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
for (const check of checks) console.log(`${check.status} ${check.name} :: ${check.evidence}`);
console.log(`WROTE ${outputPath}`);
if (checks.some((check) => check.status === "FAIL")) process.exitCode = 1;
