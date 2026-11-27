import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transcriptionBenchmarkCases } from "./transcription-benchmark.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const outputDirectory = process.env.ASR_FIXTURE_DIRECTORY
  ? path.resolve(root, process.env.ASR_FIXTURE_DIRECTORY)
  : path.join(root, ".local", "ai-eval", "synthetic-asr");
fs.mkdirSync(outputDirectory, { recursive: true });
const manifestPath = path.join(outputDirectory, "manifest.json");
fs.writeFileSync(manifestPath, `${JSON.stringify({
  schemaVersion: 1,
  synthetic: true,
  generatedAt: new Date().toISOString(),
  audioStorage: "local ignored directory",
  notes: ["English uses the en-AU Microsoft Edge Natasha neural voice; Chinese uses the installed zh-CN Microsoft Huihui voice."],
  cases: transcriptionBenchmarkCases.map(({ id, lang, languageHint, voiceLocale, category, utterance, expectedText, criticalEntities }) => ({
    id,
    lang,
    languageHint,
    voiceLocale,
    category,
    utterance,
    expectedText,
    criticalEntities,
    audioFile: `${id}.wav`,
    ...(category === "noise" ? { audioEffect: { type: "white-noise", snrDb: 24 } } : {}),
    ...(category === "pause" ? { audioEffect: { type: "mid-sentence-pause", pauseMs: 450 } } : {}),
  })),
}, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ manifestPath, cases: transcriptionBenchmarkCases.length, outputDirectory }));
