import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.PILOT_BASE_URL || "https://demo.orithos.com.au").replace(/\/+$/, "");
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const response = await fetch(`${base}/api/public/version`, { headers: { Accept: "application/json" } });
const body = await response.json().catch(() => ({}));
const frontendCommit = body.frontend?.commit ?? null;
const backendCommit = body.backend?.commit ?? null;
const matchesSourceCommit = response.ok
  && frontendCommit === sourceCommit
  && backendCommit === sourceCommit;
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit,
  runtimeCommit: frontendCommit === backendCommit ? frontendCommit : null,
  frontendCommit,
  backendCommit,
  matchesSourceCommit,
  target: base,
  httpStatus: response.status,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_RELEASE_IDENTITY_CURRENT.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, sourceCommit, runtimeCommit: output.runtimeCommit, matchesSourceCommit }));
if (!matchesSourceCommit) process.exitCode = 2;
