import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let envDirectory = root;
while (!fs.existsSync(path.join(envDirectory, ".env")) && path.dirname(envDirectory) !== envDirectory) {
  envDirectory = path.dirname(envDirectory);
}
const localEnv = fs.existsSync(path.join(envDirectory, ".env"))
  ? Object.fromEntries(fs.readFileSync(path.join(envDirectory, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }))
  : {};

const base = (process.env.PILOT_BASE_URL || "https://demo.orithos.com.au").replace(/\/+$/, "");
const username = process.env.PILOT_USERNAME || "admin";
const password = process.env.PILOT_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD || localEnv.INITIAL_ADMIN_PASSWORD;
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, ".local", "ai-eval", "ai-command-preview-guard.json");
const result = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  target: base,
  scope: "command parse/preview, execution-disabled guard, cancellation; no business writes",
  checks: [],
  businessWrites: 0,
};
const record = (name, passed, evidence) => result.checks.push({ name, status: passed ? "PASS" : "FAIL", evidence });

if (!password) throw new Error("MISSING_ADMIN_PASSWORD");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ extraHTTPHeaders: { Origin: base } });
let commandId;
try {
  const login = await context.request.post(`${base}/api/auth/login`, { data: { username, password } });
  const loginBody = await login.json().catch(() => ({}));
  record("admin login", login.ok() && loginBody.code === 0, `http=${login.status()} code=${loginBody.code ?? "none"}`);
  if (!login.ok() || loginBody.code !== 0) throw new Error("LOGIN_FAILED");

  const runtime = await context.request.get(`${base}/api/public/version`);
  const runtimeBody = await runtime.json().catch(() => ({}));
  result.runtimeCommit = runtimeBody.backend?.commit ?? null;

  const page = await context.newPage();
  await page.goto(`${base}/overview`, { waitUntil: "domcontentloaded", timeout: 90000 });
  const session = await context.request.get(`${base}/api/odoo/session`);
  const sessionBody = await session.json().catch(() => ({}));
  const catalogue = await context.request.get(`${base}/api/odoo/price-suggestions?marginTarget=0.3`);
  const catalogueBody = await catalogue.json().catch(() => ({}));
  const targetName = `UAT PREVIEW ONLY ${Date.now()}`;
  const candidates = (catalogueBody.products ?? []).filter((item) => item?.id && item?.name);
  let product;
  let parsed;
  let parsedBody = {};
  for (const candidate of candidates) {
    const response = await context.request.post(`${base}/api/ai/commands/parse`, {
      data: { text: `把 ${candidate.name} 的显示名称改成 ${targetName}`, surface: "assistant" },
    });
    const body = await response.json().catch(() => ({}));
    if (body.code === 0 && body.data?.commandId) {
      product = candidate;
      parsed = response;
      parsedBody = body;
      break;
    }
    if (body.code !== 40422) {
      parsed = response;
      parsedBody = body;
      break;
    }
  }
  const draft = parsedBody.data;
  commandId = draft?.commandId;
  record("test product found from current Odoo catalogue", session.ok() && Boolean(sessionBody.user)
    && catalogue.ok() && catalogueBody.writeEnabled === false && Boolean(product),
  `session=${session.status()} catalogue=${catalogue.status()} candidates=${candidates.length} writeEnabled=${catalogueBody.writeEnabled}`);
  const item = draft?.items?.[0];
  record("product change parse creates exact preview", Boolean(parsed?.ok() && parsedBody.code === 0)
    && draft?.type === "UPDATE_PRODUCT" && draft?.status === "PREVIEWED"
    && draft?.items?.length === 1 && item?.id === product.id && item?.field === "name"
    && item?.before === product.name && item?.after === targetName
    && Array.isArray(draft.writeRequests) && draft.writeRequests.length === 0,
  `http=${parsed.status()} code=${parsedBody.code ?? "none"} type=${draft?.type ?? "none"} status=${draft?.status ?? "none"} itemCount=${draft?.items?.length ?? 0}`);
  if (!commandId) throw new Error("COMMAND_DRAFT_NOT_CREATED");

  const preview = await context.request.post(`${base}/api/ai/commands/${commandId}/preview`);
  const previewBody = await preview.json().catch(() => ({}));
  record("preview remains read only", preview.ok() && previewBody.code === 0
    && previewBody.data?.status === "PREVIEWED"
    && Array.isArray(previewBody.data?.writeRequests) && previewBody.data.writeRequests.length === 0,
  `http=${preview.status()} code=${previewBody.code ?? "none"} status=${previewBody.data?.status ?? "none"}`);

  const confirm = await context.request.post(`${base}/api/ai/commands/${commandId}/confirm`, {
    data: { confirmationText: "确认修改", confirmationMode: "VOICE", expectedVersion: draft.version },
  });
  const confirmBody = await confirm.json().catch(() => ({}));
  record("execution switch blocks confirm", confirm.status() === 200 && confirmBody.code === 50303,
    `http=${confirm.status()} code=${confirmBody.code ?? "none"}`);

  const cancel = await context.request.post(`${base}/api/ai/commands/${commandId}/cancel`);
  const cancelBody = await cancel.json().catch(() => ({}));
  record("draft cancellation", cancel.ok() && cancelBody.code === 0 && cancelBody.data?.status === "CANCELLED",
    `http=${cancel.status()} code=${cancelBody.code ?? "none"} status=${cancelBody.data?.status ?? "none"}`);
  commandId = null;

  const replenishment = await context.request.post(`${base}/api/ai/commands/parse`, {
    data: { text: "生成低库存商品的补货建议预览", surface: "assistant" },
  });
  const replenishmentBody = await replenishment.json().catch(() => ({}));
  const replenishmentDraft = replenishmentBody.data;
  commandId = replenishmentDraft?.commandId;
  const hasSuggestions = Array.isArray(replenishmentDraft?.items) && replenishmentDraft.items.length > 0;
  const emptyResultExplained = !hasSuggestions
    && /no replenishment|没有商品需要补货|数据不完整|data is incomplete/i.test(replenishmentDraft?.summary ?? "");
  record("replenishment command returns a usable read-only preview", replenishment.ok() && replenishmentBody.code === 0
    && replenishmentDraft?.type === "PREVIEW_REPLENISHMENT" && replenishmentDraft?.status === "PREVIEWED"
    && (hasSuggestions || emptyResultExplained) && replenishmentDraft.requiresConfirmation === false
    && replenishmentDraft.writeRequests?.length === 0,
  `http=${replenishment.status()} code=${replenishmentBody.code ?? "none"} type=${replenishmentDraft?.type ?? "none"} status=${replenishmentDraft?.status ?? "none"} itemCount=${replenishmentDraft?.items?.length ?? 0} excludedCount=${replenishmentDraft?.excludedItems?.length ?? 0} emptyResultExplained=${emptyResultExplained}`);
  if (commandId) {
    await context.request.post(`${base}/api/ai/commands/${commandId}/cancel`).catch(() => {});
    commandId = null;
  }
} catch (error) {
  result.error = error instanceof Error ? error.message : "UNEXPECTED_FAILURE";
  if (commandId) {
    await context.request.post(`${base}/api/ai/commands/${commandId}/cancel`).catch(() => {});
  }
} finally {
  await context.request.post(`${base}/api/auth/logout`).catch(() => {});
  await context.close();
  await browser.close();
}

result.passed = result.checks.filter((item) => item.status === "PASS").length;
result.failed = result.checks.filter((item) => item.status === "FAIL").length;
result.status = result.failed ? "FAIL" : "PASS";
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: result.status, passed: result.passed, failed: result.failed }));
if (result.failed) process.exitCode = 1;
