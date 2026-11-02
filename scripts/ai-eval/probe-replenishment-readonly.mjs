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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[key.trim()] = value;
  }
}

const supportedCoverageDays = [7, 14, 21, 28, 42];
const coverageDays = Number(env.REPLENISHMENT_COVERAGE_DAYS || 21);
if (!supportedCoverageDays.includes(coverageDays)) {
  throw new Error(`REPLENISHMENT_COVERAGE_DAYS must be one of ${supportedCoverageDays.join(", ")}`);
}

const stores = [
  { name: "demo", base: "https://demo.orithos.com.au", username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
  { name: "skr", base: "https://skr.orithos.com.au", username: env.ORITHOS_SKR_USER || env.SKR_USER || "shawn", password: env.ORITHOS_SKR_PASS || env.SKR_PASS },
];
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const store of stores) {
    if (!store.password) throw new Error(`${store.name.toUpperCase()}_CREDENTIALS_UNAVAILABLE`);
    const context = await browser.newContext({ extraHTTPHeaders: { Origin: store.base } });
    const login = await context.request.post(`${store.base}/api/auth/login`, {
      data: { username: store.username, password: store.password },
      headers: { Origin: store.base },
    });
    const loginBody = await login.json().catch(() => ({}));
    if (!login.ok() || loginBody.code !== 0) throw new Error(`${store.name.toUpperCase()}_LOGIN_FAILED_${login.status()}`);
    const accessCookie = (await context.cookies(store.base)).find((cookie) => cookie.name === "orithos_access_token");
    const page = await context.newPage();
    if (accessCookie) {
      await page.addInitScript(({ token, user }) => {
        localStorage.setItem("sf_token", token);
        localStorage.setItem("sf_user", JSON.stringify(user));
      }, { token: accessCookie.value, user: loginBody.data.user });
    }
    const nonGetOdooCalls = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/odoo/") && !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        nonGetOdooCalls.push({ method: request.method(), path: url.pathname });
      }
    });
    await page.goto(`${store.base}/overview`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(800);
    const token = await page.evaluate(() => localStorage.getItem("sf_token"));
    const version = await page.evaluate(async () => {
      const response = await fetch("/api/public/version", { cache: "no-store" });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    });
    const session = await page.evaluate(async (authToken) => {
      const response = await fetch("/api/odoo/session", {
        headers: authToken ? { authorization: `Bearer ${authToken}` } : {}, credentials: "include",
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    }, token);
    if (session.status < 200 || session.status >= 300) throw new Error(`${store.name.toUpperCase()}_ODOO_SESSION_FAILED_${session.status}`);

    const startedAt = Date.now();
    const replenishment = await page.evaluate(async ({ authToken, days }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180000);
      try {
        const response = await fetch(`/api/odoo/replenishment?coverageDays=${days}&validateSales=true`, {
          headers: authToken ? { authorization: `Bearer ${authToken}` } : {},
          credentials: "include", cache: "no-store", signal: controller.signal,
        });
        return { status: response.status, body: await response.json().catch(() => ({})) };
      } finally { clearTimeout(timer); }
    }, { authToken: token, days: coverageDays });
    const elapsedMs = Date.now() - startedAt;
    const body = replenishment.body;
    const products = Array.isArray(body.products) ? body.products : [];
    const forecastModels = {};
    const forecastQuality = {};
    const selectedForecastCount = products.filter((item) => item.p50 !== null && item.p50 !== undefined).length;
    for (const item of products) {
      forecastModels[item.method] = (forecastModels[item.method] || 0) + 1;
      forecastQuality[item.forecastQuality] = (forecastQuality[item.forecastQuality] || 0) + 1;
    }
    const result = {
      store: store.name,
      loginStatus: login.status(),
      runtime: {
        frontendCommit: version.body?.frontend?.commit ?? null,
        frontendBuiltAt: version.body?.frontend?.builtAt ?? null,
        backendCommit: version.body?.backend?.commit ?? null,
        backendBuiltAt: version.body?.backend?.builtAt ?? null,
      },
      odooSessionStatus: session.status,
      status: replenishment.status,
      elapsedMs,
      requestedCoverageDays: coverageDays,
      responseCode: body.code ?? null,
      responseMessage: body.message ?? body.error ?? null,
      coverageDays: body.coverageDays ?? null,
      forecast: body.forecast ?? null,
      catalogueCoverage: body.catalogueCoverage ?? null,
      productCount: products.length,
      forecastedProductCount: selectedForecastCount,
      modelCounts: forecastModels,
      forecastQualityCounts: forecastQuality,
      inventoryHistory: body.inventoryHistory ?? null,
      reviewRequiredCount: body.reviewRequiredCount ?? null,
      sampleForecastProducts: products.filter((item) => item.p50 !== null && item.p50 !== undefined).slice(0, 5).map((item) => ({
        productId: item.id,
        method: item.method,
        modelVersion: item.modelVersion,
        selectionStatus: item.selectionStatus,
        forecastQuality: item.forecastQuality,
        confidence: item.forecastConfidence,
        p50: item.p50,
        p80: item.p80,
        p90: item.p90,
      })),
      nonGetOdooCalls,
      writeRequests: [],
    };
    result.pass = result.status === 200 && result.productCount > 0 && result.coverageDays === coverageDays
      && result.catalogueCoverage?.status === "COMPLETE" && nonGetOdooCalls.length === 0;
    if (!result.pass) result.error = body.message || body.code || "read-only replenishment assertion failed";
    results.push(result);
    console.log(JSON.stringify(result));
    await context.close();
  }
} finally {
  await browser.close();
}

const report = { generatedAt: new Date().toISOString(), scope: "read-only replenishment API verification; no business writes", status: results.every((result) => result.pass) ? "PASS" : "FAIL", results };
const output = env.REPLENISHMENT_PROBE_OUTPUT || ".local/ai-eval/replenishment-readonly-20261101.json";
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ report: output, status: report.status }));
if (report.status !== "PASS") process.exitCode = 1;
