import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.PILOT_BASE_URL || "https://skr.orithos.com.au").replace(/\/+$/, "");
const isSkr = new URL(base).hostname === "skr.orithos.com.au";
const username = process.env.PILOT_USERNAME || (isSkr ? process.env.ORITHOS_SKR_USER : "admin");
const password = process.env.PILOT_PASSWORD || (isSkr ? process.env.ORITHOS_SKR_PASS : process.env.INITIAL_ADMIN_PASSWORD);
const playwrightEntry = process.env.CODEX_NODE_MODULES
  ? path.join(process.env.CODEX_NODE_MODULES, "playwright", "index.mjs")
  : null;
if (!username || !password) throw new Error("Store credentials are required through environment variables");
const { chromium } = playwrightEntry && fs.existsSync(playwrightEntry)
  ? await import(pathToFileURL(playwrightEntry).href)
  : await import("playwright");

const browser = await chromium.launch({
  headless: true,
  ...(process.env.PILOT_BROWSER_EXECUTABLE_PATH
    ? { executablePath: process.env.PILOT_BROWSER_EXECUTABLE_PATH }
    : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
let assistantResponse = null;
let checks = [];
let runtime = null;

function isoDate(value) {
  const text = String(value ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(text);
  if (iso) {
    const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return date.getUTCFullYear() === Number(iso[1])
      && date.getUTCMonth() === Number(iso[2]) - 1
      && date.getUTCDate() === Number(iso[3]) ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
  }
  const localized = /^(\d{1,2})\s+([A-Za-z]{3})\.?\s+(\d{4})$/.exec(text);
  if (!localized) return null;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    .indexOf(localized[2].toLowerCase());
  if (month < 0) return null;
  const day = Number(localized[1]);
  const year = Number(localized[3]);
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day
    ? `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;
}

try {
  const versionResponse = await context.request.get(`${base}/api/public/version`);
  runtime = versionResponse.ok() ? await versionResponse.json().catch(() => null) : null;
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username, password },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
  if (!accessCookie || !loginBody.data?.user) throw new Error("LOGIN_SESSION_MISSING");

  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("sf_token", token);
    localStorage.setItem("sf_user", JSON.stringify(user));
  }, { token: accessCookie.value, user: loginBody.data.user });

  const page = await context.newPage();
  page.on("response", async (response) => {
    const request = response.request();
    if (request.method() !== "POST" || new URL(response.url()).pathname !== "/api/ai/assistant") return;
    const body = await response.json().catch(() => null);
    assistantResponse = body?.data ?? body;
  });
  await page.goto(`${base}/assistant`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  const composer = page.getByRole("textbox", { name: "Ask Orithos AI" });
  await composer.waitFor({ state: "visible", timeout: 30_000 });
  await composer.fill("sales last 7 days");
  await page.getByRole("button", { name: "Send message" }).click({ timeout: 30_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("p")].some((node) => {
    const text = node.textContent || "";
    return text.includes("Source:") || text.includes("Data source:");
  }), { timeout: 120_000 });

  const metadataBlocks = (await page.locator("p").allTextContents())
    .map((text) => text.trim())
    .filter((text) => text.includes("Source:") || text.includes("Data source:"));
  const visibleMetadata = metadataBlocks.at(-1) ?? null;
  const hasDataSource = /Data source:/i.test(visibleMetadata ?? "");
  const hasRequestedRange = /Requested: \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/i.test(visibleMetadata ?? "");
  const hasLatestReturnedDate = /Latest returned sales date: \d{4}-\d{2}-\d{2}/i.test(visibleMetadata ?? "");
  checks = [
    { name: "AI answer displays an underlying data source", status: hasDataSource ? "PASS" : "FAIL" },
    { name: "AI answer displays its requested date range", status: hasRequestedRange ? "PASS" : "FAIL" },
    { name: "AI answer distinguishes latest returned sales date", status: hasLatestReturnedDate ? "PASS" : "FAIL" },
  ];

  const rows = Array.isArray(assistantResponse?.table?.rows) ? assistantResponse.table.rows : [];
  const dates = rows.map((row) => isoDate(row.date ?? row.Date)).filter(Boolean).sort();
  const summary = {
    generatedAt: new Date().toISOString(),
    target: base,
    runtime: {
      frontendCommit: runtime?.frontend?.commit ?? null,
      backendCommit: runtime?.backend?.commit ?? null,
      frontendBuiltAt: runtime?.frontend?.builtAt ?? null,
      backendBuiltAt: runtime?.backend?.builtAt ?? null,
    },
    scope: "Authenticated browser AI sales query; auth and assistant requests only; no business writes",
    readOnly: true,
    businessWrites: 0,
    query: {
      question: "sales last 7 days",
      httpIntent: assistantResponse?.intent ?? null,
      routeSource: assistantResponse?.source ?? null,
      dataAsOf: assistantResponse?.dataAsOf ?? null,
      requestedRange: {
        from: assistantResponse?.slots?.from ?? null,
        to: assistantResponse?.slots?.to ?? null,
      },
      returnedDateRange: { from: dates[0] ?? null, to: dates.at(-1) ?? null },
      rowCount: rows.length,
    },
    visibleMetadata,
    checks,
    result: checks.every((check) => check.status === "PASS") ? "PASS" : "REVIEW",
  };
  const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
    ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
    : path.join(root, "docs", "UAT_SKR_AI_PROVENANCE_UI_CURRENT.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, result: summary.result, checks, query: summary.query, visibleMetadata }, null, 2));
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await context.close();
  await browser.close();
}
