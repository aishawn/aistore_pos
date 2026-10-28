import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
const deployment = process.env.PILOT_DEPLOYMENT_SHA ?? "unverified";
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const checks = [];
const record = (name, ok, detail) => checks.push({ name, status: ok ? "PASS" : "FAIL", detail });
try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password }, headers: { Origin: base }, timeout: 60000,
  });
  record("admin login", login.ok(), `status=${login.status()}`);
  if (!login.ok()) throw new Error(`LOGIN_FAILED_${login.status()}`);

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${base}/settings/hardware`, { waitUntil: "networkidle", timeout: 60000 });
  const hardwareText = await page.locator("body").innerText();
  const hardwareSignals = ["Hardware", "Receipt printer", "Cash drawer", "Barcode scanner", "Not verified", "Not tested"];
  record("hardware page explicitly reports unverified devices", hardwareSignals.every((signal) => hardwareText.includes(signal)),
    `signals=${hardwareSignals.filter((signal) => hardwareText.includes(signal)).join(",")}; pageErrors=${pageErrors.length}`);

  await page.goto(`${base}/settings/registers/invoices`, { waitUntil: "networkidle", timeout: 60000 });
  const invoiceText = await page.locator("body").innerText();
  record("offline numbering is explicitly unsupported", invoiceText.includes("Offline numbering") && invoiceText.includes("Not supported"),
    `liveQuote=${invoiceText.includes("live quote")}; textPresent=${invoiceText.includes("Not supported")}`);

  await page.goto(`${base}/sell`, { waitUntil: "networkidle", timeout: 60000 });
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.waitForTimeout(1000);
  const offlineText = await page.locator("body").innerText();
  const blocked = offlineText.includes("cannot complete sales") || offlineText.includes("connection returns");
  record("offline POS blocks finalisation and explains recovery", blocked,
    `banner=${blocked}; pageErrors=${pageErrors.length}`);
  await context.setOffline(false);
  await page.close();
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await context.close();
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  runtimeCommit: deployment,
  target: base,
  scope: "authenticated hardware status and offline POS browser simulation; no business writes",
  checks,
  limitations: [
    "Printer, cash drawer, barcode scanner and EFTPOS physical connection remain untested.",
    "Offline simulation uses browser network emulation; no offline sale is supported or recorded.",
  ],
  status: checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL",
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_HARDWARE_OFFLINE_ONLINE_CURRENT.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: output.checks }));
if (output.status !== "PASS") process.exitCode = 1;
