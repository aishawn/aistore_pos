import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
const deployment = process.env.PILOT_DEPLOYMENT_SHA ?? "e8e6c69";
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const evidence = {
  generatedAt: new Date().toISOString(),
  sourceCommit: deployment,
  target: base,
  scope: "admin-only AI report metrics read-only regression; no business or configuration writes",
  checks: [],
  writes: [],
};
const record = (name, status, detail = "") => evidence.checks.push({ name, status, detail });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
    timeout: 60000,
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  record("admin login", "PASS", `status=${login.status()}`);

  const metrics = await context.request.get(`${base}/api/ai/metrics?hours=24`, { headers: { Origin: base }, timeout: 60000 });
  const metricsBody = await metrics.json().catch(() => ({}));
  const summary = metricsBody?.data?.summary;
  const valid = metrics.ok()
    && metricsBody?.code === 0
    && Number(metricsBody?.data?.windowHours) === 24
    && Number.isFinite(Number(summary?.allowedRate))
    && Number.isFinite(Number(summary?.averageLatencyMs))
    && Number.isFinite(Number(summary?.estimatedTokens))
    && summary?.estimatedTokensOnly === true
    && Array.isArray(metricsBody?.data?.byPath);
  record("admin metrics response", valid ? "PASS" : "FAIL", valid ? `status=${metrics.status()} paths=${metricsBody.data.byPath.length}` : `status=${metrics.status()} code=${metricsBody?.code ?? "missing"}`);

  const anonymousContext = await browser.newContext();
  const anonymous = await anonymousContext.request.get(`${base}/api/ai/metrics?hours=24`, { headers: { Origin: base }, timeout: 60000 });
  record("anonymous metrics guard", anonymous.status() === 401 ? "PASS" : "FAIL", `status=${anonymous.status()}`);
  await anonymousContext.close();

  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const page = await context.newPage({ viewport });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${base}/reports/ai/metrics`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: "Report query metrics" }).waitFor({ timeout: 60000 });
    const table = await page.getByRole("heading", { name: "By report path" }).isVisible().catch(() => false);
    record(`metrics UI ${viewport.width}px`, pageErrors.length === 0 && table ? "PASS" : "FAIL", `table=${table} pageErrors=${pageErrors.length}`);
    await page.close();
  }

  evidence.status = evidence.checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL";
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await context.close();
  await browser.close();
}

const output = path.join(root, "docs", `UAT_AI_METRICS_ONLINE_${deployment.toUpperCase()}.json`);
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
if (evidence.status !== "PASS") process.exitCode = 1;
