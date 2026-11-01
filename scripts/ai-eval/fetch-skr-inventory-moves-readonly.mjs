import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const env = { ...process.env };
let envDirectory = process.cwd();
while (!fs.existsSync(path.join(envDirectory, ".env")) && path.dirname(envDirectory) !== envDirectory) {
  envDirectory = path.dirname(envDirectory);
}
const envPath = path.join(envDirectory, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#") || !line.includes("=")) continue;
    const [key, ...parts] = line.split("=");
    if (env[key.trim()] !== undefined) continue;
    let value = parts.join("=").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key.trim()] = value;
  }
}
const base = (env.SKR_BASE_URL || "https://skr.orithos.com.au").replace(/\/+$/, "");
const username = env.SKR_USERNAME || env.ORITHOS_SKR_USER || "shawn";
const password = env.SKR_PASSWORD || env.ORITHOS_SKR_PASS;
const snapshotPath = env.SKR_SALES_SNAPSHOT_OUTPUT || ".local/ai-eval/skr-sales-snapshot.json";
const pageSize = 1000;
const requestTimeoutMs = Math.max(10000, Math.min(90000,
  Number.parseInt(env.SKR_INVENTORY_REQUEST_TIMEOUT_MS || "60000", 10)));
const maxAttempts = Math.max(1, Math.min(6,
  Number.parseInt(env.SKR_INVENTORY_MAX_ATTEMPTS || "4", 10)));

if (!password) throw new Error("SKR_PASSWORD or ORITHOS_SKR_PASS is required");
if (!fs.existsSync(snapshotPath)) throw new Error(`sales snapshot not found: ${snapshotPath}`);

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
if (snapshot.source !== "skr-odoo-readonly-sales-and-inventory-moves") {
  throw new Error("input snapshot is not the expected read-only Odoo sales snapshot");
}
if (snapshot.writeRequests?.length) throw new Error("refusing snapshot containing business writes");

function isoUtc(value) {
  if (!value) throw new Error("snapshot inventory range is missing");
  const normalized = String(value).includes("T") ? String(value) : `${String(value).replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) throw new Error("snapshot inventory range is invalid");
  return parsed.toISOString();
}

const from = isoUtc(snapshot.dataQuality?.inventoryHistoryFrom);
const to = isoUtc(snapshot.dataQuality?.inventoryHistoryTo);
const checkpointPath = `${snapshotPath}.inventory-moves.partial.json`;
const checkpointDataPath = `${checkpointPath}.jsonl`;
const queryIdentity = { sourceVersion: snapshot.snapshotVersion, companyId: snapshot.companyId, from, to };

function writeJsonAtomic(destination, value) {
  const temporary = `${destination}.tmp`;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, destination);
}

let checkpoint = { queryIdentity, offset: 0, diagnostics: [], companyIds: [] };
let moves = [];
if (fs.existsSync(checkpointPath)) {
  checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  if (JSON.stringify(checkpoint.queryIdentity) !== JSON.stringify(queryIdentity)) {
    throw new Error(`inventory checkpoint belongs to a different query: ${checkpointPath}`);
  }
  if (fs.existsSync(checkpointDataPath)) {
    for (const line of fs.readFileSync(checkpointDataPath, "utf8").split(/\r?\n/)) {
      if (line) moves.push(...JSON.parse(line));
    }
  }
  if (moves.length !== checkpoint.offset) throw new Error("inventory checkpoint page data is incomplete");
}
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ extraHTTPHeaders: { Origin: base } });
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username, password }, headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`SKR_LOGIN_FAILED_${login.status()}`);
  const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
  const page = await context.newPage();
  if (accessCookie) {
    await page.addInitScript(({ token, user }) => {
      localStorage.setItem("sf_token", token);
      localStorage.setItem("sf_user", JSON.stringify(user));
    }, { token: accessCookie.value, user: loginBody.data.user });
  }
  await page.goto(`${base}/overview`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1000);
  const session = await page.evaluate(async () => {
    const token = localStorage.getItem("sf_token");
    const response = await fetch("/api/odoo/session", {
      headers: token ? { authorization: `Bearer ${token}` } : {}, credentials: "include",
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  });
  if (session.status < 200 || session.status >= 300) {
    throw new Error(`SKR_ODOO_SESSION_FAILED_${session.status}`);
  }

  const diagnostics = checkpoint.diagnostics;
  let offset = moves.length;
  let hasNext = true;
  let companyIds = checkpoint.companyIds;
  while (hasNext) {
    let result;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        result = await page.evaluate(async ({ fromValue, toValue, limit, offsetValue, timeoutMs }) => {
          const token = localStorage.getItem("sf_token");
          const params = new URLSearchParams({ from: fromValue, to: toValue,
            limit: String(limit), offset: String(offsetValue) });
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const response = await fetch(`/api/odoo/inventory-history?${params.toString()}`, {
              headers: token ? { authorization: `Bearer ${token}` } : {},
              credentials: "include", signal: controller.signal,
            });
            return { status: response.status, body: await response.json().catch(() => ({})) };
          } finally {
            clearTimeout(timer);
          }
        }, { fromValue: from, toValue: to, limit: pageSize, offsetValue: offset,
          timeoutMs: requestTimeoutMs });
      } catch (error) {
        if (attempt + 1 >= maxAttempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
        continue;
      }
      if (result.status === 401 && attempt + 1 < maxAttempts) {
        await page.evaluate(async () => {
          const token = localStorage.getItem("sf_token");
          await fetch("/api/odoo/session", {
            headers: token ? { authorization: `Bearer ${token}` } : {}, credentials: "include",
          });
        });
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      if ([429, 502, 503, 504, 599].includes(result.status) && attempt + 1 < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
        continue;
      }
      break;
    }
    diagnostics.push({ offset, status: result.status, count: result.body?.items?.length || 0 });
    if (result.status < 200 || result.status >= 300) {
      writeJsonAtomic(checkpointPath, { queryIdentity, offset: moves.length, diagnostics, companyIds });
      throw new Error(`SKR_INVENTORY_HISTORY_FAILED_${result.status}_AT_${offset}; checkpoint saved`);
    }
    const rows = Array.isArray(result.body?.items) ? result.body.items : [];
    if (!companyIds.length) companyIds = Array.isArray(result.body?.companyIds) ? result.body.companyIds : [];
    fs.mkdirSync(path.dirname(checkpointDataPath), { recursive: true });
    fs.appendFileSync(checkpointDataPath, `${JSON.stringify(rows)}\n`, "utf8");
    moves.push(...rows);
    hasNext = result.body?.hasNext === true;
    offset += rows.length;
    if (hasNext && rows.length === 0) throw new Error("SKR inventory pagination made no progress");
    if (offset > 500000) throw new Error("SKR inventory move history exceeded the safety limit");
    writeJsonAtomic(checkpointPath, { queryIdentity, offset: moves.length, diagnostics, companyIds });
    console.error(JSON.stringify({ phase: "inventory_moves", offset, hasNext }));
  }

  const expectedCompanyId = Number(snapshot.companyId);
  if (!companyIds.includes(expectedCompanyId)) {
    throw new Error("SKR company scope does not match the sales snapshot company");
  }
  const invalidCompanyRows = moves.filter((move) => Number(move.companyId) !== expectedCompanyId).length;
  if (invalidCompanyRows) throw new Error(`SKR inventory response included ${invalidCompanyRows} out-of-scope rows`);

  snapshot.inventoryMoves = moves;
  snapshot.dataQuality.status = "SALES_CURRENT_STOCK_AND_INVENTORY_MOVES";
  snapshot.dataQuality.inventoryHistory = "AVAILABLE";
  snapshot.stockoutDataQuality = "MOVES_AVAILABLE_FOR_RECONSTRUCTION";
  snapshot.dataQuality.inventoryHistoryMoveCount = moves.length;
  snapshot.dataQuality.inventoryHistorySource = "skr-readonly-api-odoo-inventory-history";
  snapshot.fetchDiagnostics = { ...(snapshot.fetchDiagnostics || {}), inventoryHistory: diagnostics };
  writeJsonAtomic(snapshotPath, snapshot);
  fs.rmSync(checkpointPath, { force: true });
  fs.rmSync(checkpointDataPath, { force: true });
  console.log(JSON.stringify({ output: snapshotPath, companyId: expectedCompanyId,
    inventoryMoves: moves.length, productCount: snapshot.series.length,
    dateRange: [snapshot.dataQuality.inventoryHistoryFrom, snapshot.dataQuality.inventoryHistoryTo],
    writeRequests: snapshot.writeRequests }));
} finally {
  await browser.close();
}
