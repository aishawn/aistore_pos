import fs from "node:fs";
import process from "node:process";
import { assistantFixtureContract } from "./assistant-assertions.mjs";

const input = process.argv[2] || "scripts/ai-eval/fixtures/utterances.jsonl";
const lines = fs.readFileSync(input, "utf8").split(/\r?\n/).filter(Boolean);
const ids = new Set();
const errors = [];
const missingAnswerExpectationIds = [];
let factualCases = 0;
let coveredFactualCases = 0;
for (let index = 0; index < lines.length; index += 1) {
  let testCase;
  try { testCase = JSON.parse(lines[index]); } catch (error) { errors.push(`line ${index + 1}: invalid JSON (${error.message})`); continue; }
  if (!testCase || typeof testCase !== "object" || Array.isArray(testCase)) {
    errors.push(`line ${index + 1}: case must be an object`);
    continue;
  }
  if (typeof testCase.id !== "string" || !testCase.id.trim()) errors.push(`line ${index + 1}: missing id`);
  if (ids.has(testCase.id)) errors.push(`line ${index + 1}: duplicate id ${testCase.id}`);
  ids.add(testCase.id);
  if (!testCase.category) errors.push(`${testCase.id}: missing category`);
  if (!testCase.question) errors.push(`${testCase.id}: missing question`);
  if (!testCase.expected?.intent) errors.push(`${testCase.id}: missing expected.intent`);

  const expected = testCase.expected ?? {};
  const contract = assistantFixtureContract(expected);
  const hasDynamicReportExpectation = typeof expected.metric === "string"
    && expected.metric.trim().length > 0
    && typeof expected.period === "string"
    && expected.period.trim().length > 0;
  const dynamicFieldsComplete = (expected.metric === undefined && expected.period === undefined)
    || hasDynamicReportExpectation;
  if (!dynamicFieldsComplete) errors.push(`${testCase.id}: dynamic report cases require both metric and period`);
  if (contract.answerContentAssertionRequired) {
    factualCases += 1;
    const hasAnswerExpectation = contract.answerAssertionsPresent || hasDynamicReportExpectation;
    if (hasAnswerExpectation) coveredFactualCases += 1;
    else {
      missingAnswerExpectationIds.push(testCase.id);
      errors.push(`${testCase.id}: missing positive answer expectation`);
    }
  }
  if (expected.negative !== undefined && !Array.isArray(expected.negative)) {
    errors.push(`${testCase.id}: expected.negative must be an array when provided`);
  } else if (!contract.negativeAssertionsPresent) {
    for (const assertion of contract.unsupportedNegativeAssertions) {
      errors.push(`${testCase.id}: unsupported negative assertion (${String(assertion)})`);
    }
  }
}
const summary = {
  input,
  cases: lines.length,
  uniqueIds: ids.size,
  factualCases,
  coveredFactualCases,
  missingAnswerExpectationIds,
  errors,
};
console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exitCode = 1;
