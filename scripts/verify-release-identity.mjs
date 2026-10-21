import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const expected = process.env.SOURCE_COMMIT ?? "";
if (!/^[a-f0-9]{40}$/.test(expected)) throw new Error("Set SOURCE_COMMIT to the full candidate SHA.");
const base = new URL(process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au");
if (base.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(base.hostname) && !base.hostname.endsWith(".localhost")) throw new Error("Use HTTPS for remote verification.");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = { generatedAt: new Date().toISOString(), target: base.origin, expectedCommit: expected, sourceWorkingTree: false, scope: "version endpoint only; no business writes", status: "BLOCKED", deploymentShaVerified: false, services: null };
try {
  const response = await fetch(new URL("/api/public/version", base), { redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Version endpoint unavailable.");
  const payload = await response.json();
  report.services = Object.fromEntries(["frontend", "backend"].map((name) => [name, {
    service: payload[name]?.service ?? null, commit: payload[name]?.commit ?? null, builtAt: payload[name]?.builtAt ?? null,
  }]));
  report.deploymentShaVerified = ["frontend", "backend"].every((name) => payload[name]?.service === `orithos-${name}`
    && payload[name]?.commit === expected && Number.isFinite(Date.parse(payload[name]?.builtAt)));
  report.status = report.deploymentShaVerified ? "PASS" : "BLOCKED";
} catch { /* Intentionally omit network errors which can contain infrastructure URLs. */ }
const output = process.env.PILOT_EVIDENCE_FILE || path.join(root, `docs/UAT_RELEASE_IDENTITY_${Date.now()}.json`);
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(`${report.status}: release identity evidence written.`);
if (!report.deploymentShaVerified) process.exitCode = 1;
