import fs from "node:fs";
import path from "node:path";
import { mergeTranscriptionPartialReports, transcriptionAudioFingerprints } from "./transcription-aggregation.mjs";

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error("Usage: node scripts/ai-eval/merge-transcription-reports.mjs <manifest.json> <output.json> <partial-report.json> [partial-report.json ...]");
  process.exit(2);
}

const [manifestPath, outputPath, ...reportPaths] = args.map((arg) => path.resolve(arg));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const reports = reportPaths.map((reportPath) => JSON.parse(fs.readFileSync(reportPath, "utf8")));
const audioFingerprints = transcriptionAudioFingerprints(manifest.cases, path.dirname(manifestPath));
const merged = mergeTranscriptionPartialReports(reports, manifest.cases, audioFingerprints);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, status: merged.gate.status, caseCount: merged.caseCount }));
if (merged.gate.status === "FAIL") process.exitCode = 1;
else if (merged.gate.status === "BLOCKED") process.exitCode = 2;
