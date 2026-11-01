import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let envDirectory = root;
while (!fs.existsSync(path.join(envDirectory, ".env")) && path.dirname(envDirectory) !== envDirectory) {
  envDirectory = path.dirname(envDirectory);
}
const envPath = path.join(envDirectory, ".env");
const env = {
  ...process.env,
  ...(fs.existsSync(envPath) ? Object.fromEntries(fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    })) : {}),
};
const apiKey = env.AI_DASHSCOPE_API_KEY;
const baseUrl = (env.AI_DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com").replace(/\/+$/, "");
const model = env.AI_DASHSCOPE_MODEL || "qwen-plus";
const normalizedModel = model.trim().toLowerCase();
const usesMultimodal = normalizedModel.includes("vl") || normalizedModel.startsWith("qvq")
  || normalizedModel.startsWith("qwen3.7") || normalizedModel.startsWith("qwen3.8")
  || normalizedModel.startsWith("qwen3.9") || /^qwen3\.\d{2,}([.\-].*)?$/.test(normalizedModel);
const endpointPath = env.AI_DASHSCOPE_COMPLETIONS_PATH
  || (usesMultimodal
    ? "/api/v1/services/aigc/multimodal-generation/generation"
    : "/api/v1/services/aigc/text-generation/generation");
const result = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  scope: "single short DashScope health prompt; contains no store or customer data",
  model,
  endpointPath,
  checks: [],
};

if (!apiKey) {
  result.checks.push({ name: "DashScope credentials configured", status: "BLOCKED", evidence: "API key is not configured locally." });
} else {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${endpointPath}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: { messages: [{ role: "user", content: "Reply with exactly OK." }] },
        parameters: { result_format: "message", temperature: 0, max_tokens: 8 },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const payload = await response.json().catch(() => ({}));
    const message = payload.output?.choices?.[0]?.message?.content;
    const hasText = typeof message === "string" && message.trim().length > 0
      || Array.isArray(message) && message.some((part) => typeof part?.text === "string" && part.text.trim());
    result.checks.push({
      name: "DashScope generation endpoint responds",
      status: response.ok && !payload.code && hasText ? "PASS" : "FAIL",
      evidence: {
        httpStatus: response.status,
        providerCode: typeof payload.code === "string" ? payload.code.slice(0, 64) : null,
        hasTextResponse: hasText,
        elapsedMs: Date.now() - startedAt,
        responseBodyAndCredentialOmitted: true,
      },
    });
  } catch (error) {
    result.checks.push({
      name: "DashScope generation endpoint responds",
      status: "BLOCKED",
      evidence: {
        errorType: error instanceof Error ? error.name : "UnknownError",
        networkErrorCode: error && typeof error === "object" && "cause" in error
          ? error.cause?.code ?? null
          : null,
        elapsedMs: Date.now() - startedAt,
        responseBodyAndCredentialOmitted: true,
      },
    });
  }
}

result.passed = result.checks.filter((item) => item.status === "PASS").length;
result.blocked = result.checks.filter((item) => item.status === "BLOCKED").length;
result.failed = result.checks.filter((item) => item.status === "FAIL").length;
result.status = result.failed ? "FAIL" : result.blocked ? "BLOCKED" : "PASS";
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_DASHSCOPE_HEALTH.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: result.status, checks: result.checks }));
if (result.failed) process.exitCode = 1;
else if (result.blocked) process.exitCode = 2;
