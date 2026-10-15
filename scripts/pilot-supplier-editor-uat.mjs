import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");
const base = "https://demo.orithos.com.au";
const browser = await chromium.launch({ headless: true });
const results = [];
const errors = [];
const writes = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const login = await context.request.post(`${base}/api/auth/login`, { data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD }, headers: { Origin: base }, timeout: 60000 });
    const body = await login.json().catch(() => ({}));
    if (!login.ok() || body.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${width}px ${error.message}`));
    page.on("request", (request) => { const url = new URL(request.url()); if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/") && request.method() !== "GET") writes.push(`${request.method()} ${url.pathname}`); });
    await page.goto(`${base}/suppliers/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("button", { name: "Save", exact: true }).waitFor({ state: "visible", timeout: 30000 });
    await page.getByRole("heading", { name: "New Supplier", exact: true }).waitFor({ state: "visible", timeout: 15000 });
    const metrics = await page.evaluate(() => {
      const frame = document.querySelector("div.absolute.inset-0.z-50");
      const heading = document.querySelector("h1");
      const save = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Save");
      const rgb = (element) => element ? getComputedStyle(element).color : null;
      return {
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        overlayBackground: frame ? getComputedStyle(frame).backgroundColor : null,
        headingColor: rgb(heading),
        saveVisible: Boolean(save && save.getBoundingClientRect().width && save.getBoundingClientRect().height),
        overlayHasLightScrim: /(?:\/\s*0?\.35|,\s*0?\.35)\)$/.test(frame ? getComputedStyle(frame).backgroundColor : ""),
        saveBox: save ? (() => { const r = save.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; })() : null,
      };
    });
    const pass = metrics.documentWidth <= width && metrics.bodyWidth <= width && metrics.saveVisible && metrics.overlayHasLightScrim && metrics.headingColor === "rgb(31, 41, 55)" && writes.length === 0;
    results.push({ ...metrics, status: pass ? "PASS" : "FAIL" });
    await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
    await context.close();
  }
} finally { await browser.close(); }
const report = { generatedAt: new Date().toISOString(), sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), deployment: process.env.PILOT_DEPLOYMENT_SHA || null, target: base, scope: "supplier editor visual/responsive read-only UAT; save not clicked", results, pageErrors: errors, mutatingApiRequests: writes, passed: results.filter((r) => r.status === "PASS").length, failed: results.filter((r) => r.status !== "PASS").length };
const out = path.join(root, "docs/UAT_SUPPLIER_EDITOR_2026-10-14.json");
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath: out, passed: report.passed, failed: report.failed, results, pageErrors: errors, mutatingApiRequests: writes }));
if (report.failed || errors.length || writes.length) process.exitCode = 1;

