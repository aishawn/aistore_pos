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
const token = env.AI_SERVICE_TOKEN;
const baseUrl = (env.AI_SERVICE_BASE_URL || "https://ai.orithos.com.au").replace(/\/+$/, "");
const model = env.AI_GATEWAY_PRIMARY_MODEL || "qwen-plus";
const endpoint = `${baseUrl}/v1/provider/chat/completions`;
const result = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  scope: "single short remote AI gateway prompt; contains no store or customer data",
  model,
  checks: [],
};

if (!token) {
  result.checks.push({ name: "remote AI gateway token configured", status: "BLOCKED", evidence: "AI_SERVICE_TOKEN is not configured locally." });
} else {
  const startedAt = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with exactly OK." }],
        temperature: 0,
        max_tokens: 8,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const payload = await response.json().catch(() => ({}));
    const message = payload.choices?.[0]?.message?.content;
    const hasText = typeof message === "string" && message.trim().length > 0;
    result.checks.push({
      name: "remote AI gateway completion responds",
      status: response.ok && hasText ? "PASS" : "FAIL",
      evidence: {
        httpStatus: response.status,
        hasTextResponse: hasText,
        elapsedMs: Date.now() - startedAt,
        responseBodyAndCredentialOmitted: true,
      },
    });
  } catch (error) {
    result.checks.push({
      name: "remote AI gateway completion responds",
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
  : path.join(root, "docs", "UAT_AI_GATEWAY_HEALTH.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: result.status, checks: result.checks }));
if (result.failed) process.exitCode = 1;
else if (result.blocked) process.exitCode = 2;
