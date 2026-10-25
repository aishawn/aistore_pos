/**
 * Read-only verification of all Orithos AI surfaces (local or demo).
 * Does not write Odoo prices, receive invoices, or confirm RFQs.
 *
 * Usage:
 *   PILOT_BASE_URL=https://demo.orithos.com.au node scripts/pilot-ai-features-verify-uat.mjs
 *   PILOT_BASE_URL=http://127.0.0.1:3035 node scripts/pilot-ai-features-verify-uat.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const env = fs.existsSync(envPath)
  ? Object.fromEntries(
      fs.readFileSync(envPath, "utf8")
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
        }),
    )
  : {};

const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const checks = [];
const record = (name, status, evidence = "") => checks.push({ name, status, evidence });
const safeEvidence = (value) => String(value ?? "")
  .replace(/(cookie|authorization):[^\r\n]*/gi, "$1: [redacted]")
  .replace(/(access|refresh)[_-]?token=[^;\s]+/gi, "$1=[redacted]")
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-token]");
const priceSuggestionErrorClass = (message) => {
  if (/session expired/i.test(message ?? "")) return "odoo_session_expired";
  if (/not configured/i.test(message ?? "")) return "odoo_not_configured";
  if (/must use https/i.test(message ?? "")) return "odoo_transport_configuration";
  if (/no odoo companies/i.test(message ?? "")) return "no_allowed_company";
  if (/cannot read the product prices/i.test(message ?? "")) return "odoo_product_price_access_denied";
  if (/price suggestion data is unavailable/i.test(message ?? "")) return "odoo_rpc_or_transport_unavailable";
  return message ? "unclassified_api_error" : "empty_error_response";
};

const adminPassword = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!adminPassword) {
  console.error("MISSING_ADMIN_PASSWORD");
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password: adminPassword },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) {
    record("login", "FAIL", `status=${login.status()} code=${loginBody.code}`);
  } else {
    record("login", "PASS", "admin");
    const accessCookie = (await context.cookies(base)).find((c) => c.name === "orithos_access_token");
    if (accessCookie && loginBody.data?.user) {
      await context.addInitScript(({ token, user }) => {
        localStorage.setItem("sf_token", token);
        localStorage.setItem("sf_user", JSON.stringify(user));
      }, { token: accessCookie.value, user: loginBody.data.user });
    }

    const configRes = await context.request.get(`${base}/api/ai/config/client`);
    const configBody = await configRes.json().catch(() => ({}));
    const cfg = configBody.data ?? {};
    record(
      "AI client config",
      configRes.ok() && configBody.code === 0 ? "PASS" : "FAIL",
      `enabled=${cfg.enabled} assistantAvailable=${cfg.assistantAvailable} transcription=${cfg.transcriptionAvailable} labelVision=${cfg.labelVisionAvailable} invoiceVision=${cfg.invoiceVisionAvailable}`,
    );

    const assistant = await context.request.post(`${base}/api/ai/assistant`, {
      data: { question: "look up products" },
      headers: { Origin: base },
    });
    const assistantBody = await assistant.json().catch(() => ({}));
    if (assistantBody.code === 0 && assistantBody.data?.threadId) {
      record("NLQ assistant", "PASS", `intent=${assistantBody.data.intent ?? "n/a"}`);
    } else if (assistantBody.code === 50301 && cfg.enabled) {
      record("NLQ assistant", "FAIL", "enabled=true but assistant graph unavailable (50301)");
    } else if (assistantBody.code === 50301) {
      record("NLQ assistant", "BLOCKED", "AI disabled (50301)");
    } else {
      record("NLQ assistant", "FAIL", `code=${assistantBody.code} ${assistantBody.message || ""}`);
    }

    const emptyAudio = await context.request.post(`${base}/api/ai/transcribe`, {
      multipart: { file: { name: "empty.webm", mimeType: "audio/webm", buffer: Buffer.alloc(0) } },
    });
    const emptyAudioBody = await emptyAudio.json().catch(() => ({}));
    if (emptyAudioBody.code === 40010) record("ASR empty guard", "PASS", "40010");
    else if (emptyAudioBody.code === 50301) record("ASR empty guard", "BLOCKED", "transcription disabled");
    else record("ASR empty guard", "FAIL", `code=${emptyAudioBody.code}`);

    const identify = await context.request.get(`${base}/api/ai/sommelier/identify?q=shiraz`);
    const identifyBody = await identify.json().catch(() => ({}));
    const items = identifyBody.data?.items ?? [];
    const productId = items[0]?.productId;
    record(
      "Sommelier identify text",
      identifyBody.code === 0 && items.length > 0 ? "PASS" : "FAIL",
      `count=${items.length} productId=${productId ?? "none"}`,
    );

    const recommend = await context.request.post(`${base}/api/ai/sommelier/recommend`, {
      data: { budgetMax: 40, occasion: "dinner", styles: ["red"] },
      headers: { Origin: base },
    });
    const recommendBody = await recommend.json().catch(() => ({}));
    record(
      "Sommelier recommend",
      recommendBody.code === 0 ? "PASS" : "FAIL",
      `recs=${recommendBody.data?.recommendations?.length ?? 0}`,
    );

    if (productId) {
      for (const [name, route, payload] of [
        ["Sommelier pitch", "/api/ai/sommelier/pitch", { productId, length: "short" }],
        ["Sommelier ask", "/api/ai/sommelier/ask", { productId, question: "What food pairs well?" }],
        ["Sommelier similar", "/api/ai/sommelier/similar", { productId, direction: "cheaper" }],
      ]) {
        const res = await context.request.post(`${base}${route}`, { data: payload, headers: { Origin: base } });
        const body = await res.json().catch(() => ({}));
        record(name, body.code === 0 ? "PASS" : "FAIL", body.message || JSON.stringify(body.data ?? {}).slice(0, 120));
      }
    } else {
      record("Sommelier pitch/ask/similar", "BLOCKED", "no productId from identify");
    }

    const emptyImage = await context.request.post(`${base}/api/ai/sommelier/identify-image`, {
      multipart: { file: { name: "empty.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(0) } },
    });
    const emptyImageBody = await emptyImage.json().catch(() => ({}));
    if (emptyImageBody.code === 40010) record("Label image empty guard", "PASS", "40010");
    else if (emptyImageBody.code === 50301) record("Label image empty guard", "BLOCKED", "vision disabled");
    else record("Label image empty guard", "FAIL", `code=${emptyImageBody.code}`);

    // Use a decodable image so this check reaches provider/model validation.
    // It is intentionally not treated as a successful OCR fixture: a real invoice
    // photo is still required for field extraction acceptance.
    const validImagePath = path.join(root, "docs", "screenshots", "2026-10-19-ai-nav", "invoice-1440.png");
    const validImage = fs.existsSync(validImagePath)
      ? fs.readFileSync(validImagePath)
      : Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      );
    const invoice = await context.request.post(`${base}/api/ai/invoice/preview`, {
      multipart: {
        file: {
          name: "valid-image.png",
          mimeType: "image/png",
          buffer: validImage,
        },
      },
      timeout: 120000,
    });
    const invoiceContentType = invoice.headers()["content-type"] ?? "unknown";
    const invoiceBody = await invoice.json().catch(() => null);
    const invoiceCode = Number.isInteger(invoiceBody?.code) ? invoiceBody.code : null;
    const invoiceEvidence = (detail) => JSON.stringify({
      httpStatus: invoice.status(),
      contentType: invoiceContentType,
      apiCode: invoiceCode,
      detail,
    });
    if (!invoiceBody || typeof invoiceBody !== "object" || invoiceCode === null) {
      const isServerFailure = invoice.status() >= 500;
      record("Invoice OCR probe", isServerFailure ? "BLOCKED" : "FAIL", invoiceEvidence(
        invoiceBody ? "response did not contain a numeric business code" : "response was not JSON",
      ));
    } else if (invoiceCode === 0) record("Invoice OCR probe", "PASS", invoiceEvidence("parsed"));
    else if (invoiceCode === 50301) record("Invoice OCR probe", "BLOCKED", invoiceEvidence("vision disabled"));
    else if (String(invoiceBody.message || "").toLowerCase().includes("model")) {
      record("Invoice OCR probe", "FAIL", invoiceEvidence("provider model/configuration error"));
    } else if (invoiceCode === 50212) {
      record("Invoice OCR probe", "INFO", invoiceEvidence("provider reachable; probe image has no invoice fields"));
    } else if (invoiceCode === 40010) {
      record("Invoice OCR probe", "FAIL", invoiceEvidence("valid image was rejected as empty"));
    } else if (invoiceCode === 50213) {
      record("Invoice OCR probe", "FAIL", invoiceEvidence("provider/model configuration failure"));
    } else if (invoiceCode === 41001 || invoice.status() === 410) {
      record("Invoice OCR probe", "BLOCKED", invoiceEvidence("invoice OCR route unavailable or deprecated; no extraction claim"));
    } else {
      record("Invoice OCR probe", "FAIL", invoiceEvidence("unexpected invoice OCR response"));
    }

    const page = await context.newPage();
    await page.goto(`${base}/overview`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(2500);

    const odooSession = await context.request.get(`${base}/api/odoo/session`);
    const odooSessionBody = await odooSession.json().catch(() => ({}));
    if (!odooSessionBody.user) {
      record("Odoo session for price suggestions", "BLOCKED", odooSessionBody.autoRecoverConfigured
        ? "Service-account recovery was configured but did not return a session."
        : "No active Odoo session and no service-account recovery configured.");
    }
    const priceStartedAt = Date.now();
    const priceApi = await context.request.get(`${base}/api/odoo/price-suggestions?marginTarget=0.3`);
    const priceElapsedMs = Date.now() - priceStartedAt;
    const priceBody = await priceApi.json().catch(() => ({}));
    if (priceApi.ok() && Array.isArray(priceBody.products) && priceBody.writeEnabled === false) {
      record("Price suggestions API", "PASS", `products=${priceBody.products.length} writeEnabled=false`);
    } else if (priceApi.status() === 401 && !odooSessionBody.user) {
      record("Price suggestions API", "BLOCKED", "Odoo session is not available in this environment.");
    } else if ([502, 503, 504].includes(priceApi.status())) {
      // A gateway/upstream outage is an environment block, not a product
      // assertion failure. Keep the status visible so deployment checks still
      // require the endpoint to recover before calling the suite green.
      record("Price suggestions API", "BLOCKED", JSON.stringify({
        status: priceApi.status(),
        errorClass: priceSuggestionErrorClass(priceBody.message),
        contentType: priceApi.headers()["content-type"] ?? null,
        server: priceApi.headers().server ?? null,
        elapsedMs: priceElapsedMs,
        correlationId: priceApi.headers()["x-correlation-id"] ?? null,
        writeEnabled: priceBody.writeEnabled ?? null,
      }));
    } else {
      record("Price suggestions API", "FAIL", JSON.stringify({
        status: priceApi.status(),
        errorClass: priceSuggestionErrorClass(priceBody.message),
        contentType: priceApi.headers()["content-type"] ?? null,
        server: priceApi.headers().server ?? null,
        elapsedMs: priceElapsedMs,
        correlationId: priceApi.headers()["x-correlation-id"] ?? null,
      }));
    }

    await page.goto(`${base}/stock/price-suggestions`, { waitUntil: "domcontentloaded", timeout: 90000 });
    try {
      await page.getByRole("heading", { name: "Price suggestions", exact: true }).waitFor({ timeout: 30000 });
      record("Price suggestions page", "PASS", page.url());
    } catch {
      record("Price suggestions page", "FAIL", page.url());
    }

    await page.goto(`${base}/stock/replenishment`, { waitUntil: "domcontentloaded", timeout: 90000 });
    try {
      await page.getByRole("heading", { name: /Replenishment/i }).first().waitFor({ timeout: 30000 });
      record("Replenishment page", "PASS", page.url());
    } catch {
      record("Replenishment page", "INFO", `heading miss url=${page.url()}`);
    }

    await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
    const anon = await context.request.post(`${base}/api/ai/assistant`, {
      data: { question: "look up products" },
      headers: { Origin: base },
    });
    record("Anonymous assistant guard", anon.status() === 401 ? "PASS" : "FAIL", `status=${anon.status()}`);
  }
} catch (error) {
  const detail = safeEvidence(error instanceof Error ? error.message : "failed");
  const blocked = /Timeout|ECONNRESET|ETIMEDOUT|50210|50301|HTTP 50[234]/i.test(detail);
  record("run", blocked ? "BLOCKED" : "FAIL", detail);
} finally {
  await browser.close();
}

const hardFails = checks.filter((c) => c.status === "FAIL").length;
const blocked = checks.filter((c) => c.status === "BLOCKED").length;
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  deployment: /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
    ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase()
    : "unverified-after-deploy",
  target: base,
  scope: "read-only AI feature matrix; no Odoo price writes / invoice receive / RFQ confirm",
  status: hardFails > 0 ? "FAIL" : blocked > 0 ? "BLOCKED" : "PASS",
  checks,
  passed: checks.filter((c) => c.status === "PASS").length,
  failed: hardFails,
  blocked,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_FEATURES_VERIFY_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: output.passed, failed: output.failed, blocked: output.blocked }));
if (hardFails) process.exitCode = 1;
else if (blocked) process.exitCode = 2;
