import fs from "node:fs";
import process from "node:process";

const input = process.argv[2] || "scripts/ai-eval/fixtures/utterances.jsonl";
const lines = fs.readFileSync(input, "utf8").split(/\r?\n/).filter(Boolean);
const ids = new Set();
const errors = [];
for (let index = 0; index < lines.length; index += 1) {
  let testCase;
  try { testCase = JSON.parse(lines[index]); } catch (error) { errors.push(`line ${index + 1}: invalid JSON (${error.message})`); continue; }
  if (!testCase.id) errors.push(`line ${index + 1}: missing id`);
  if (ids.has(testCase.id)) errors.push(`line ${index + 1}: duplicate id ${testCase.id}`);
  ids.add(testCase.id);
  if (!testCase.category) errors.push(`${testCase.id}: missing category`);
  if (!testCase.question) errors.push(`${testCase.id}: missing question`);
  if (!testCase.expected?.intent) errors.push(`${testCase.id}: missing expected.intent`);
  if (!Array.isArray(testCase.expected?.negative)) errors.push(`${testCase.id}: expected.negative must be an array`);
}
const summary = { input, cases: lines.length, uniqueIds: ids.size, errors };
console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exitCode = 1;
