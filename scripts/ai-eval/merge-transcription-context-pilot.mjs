import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { transcriptionAudioFingerprints } from "./transcription-aggregation.mjs";
import { mergeTranscriptionContextPilotReports } from "./transcription-context-pilot.mjs";

function main() {
  const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const args = process.argv.slice(2);
  if (args.length < 3) {
    throw new TypeError("usage: merge-transcription-context-pilot.mjs <manifest.json> <output.json> <report.json> [report.json ...]");
  }

  const [manifestPath, outputPath, ...reportPaths] = args.map((arg) => path.resolve(arg));
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (!Array.isArray(manifest.cases) || manifest.cases.length === 0) throw new TypeError("manifest has no benchmark cases");

  const reports = reportPaths.map((reportPath) => JSON.parse(fs.readFileSync(reportPath, "utf8")));
  const merged = mergeTranscriptionContextPilotReports(reports, manifest.cases, {
    audioFingerprints: transcriptionAudioFingerprints(manifest.cases, path.dirname(manifestPath)),
    datasetManifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
  });

  const allowedOutputRoot = path.resolve(scriptRoot, ".local/ai-eval") + path.sep;
  if (!outputPath.startsWith(allowedOutputRoot)) throw new TypeError("merged report must be written under .local/ai-eval");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${JSON.stringify({ reportPath: path.relative(scriptRoot, outputPath), status: merged.status, caseCount: merged.caseCount }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.name}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
