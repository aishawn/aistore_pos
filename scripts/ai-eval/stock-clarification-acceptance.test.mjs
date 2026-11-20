import assert from "node:assert/strict";
import test from "node:test";
import { stockClarificationAcceptance, runtimeMatchesSource, assistantRuntimePreflight } from "./stock-clarification-acceptance.mjs";

const validResponse = {
  intent: "qa",
  answer: "Please provide the exact product name or barcode.",
  source: "deterministic",
  llmFallback: false,
  ui: { route: null },
  writeRequests: [],
};

test("stock clarification requires a deterministic answer without fallback or writes", () => {
  const result = stockClarificationAcceptance(validResponse, {
    responseOk: true,
    code: 0,
    answerIncludes: "product name or barcode",
  });

  assert.equal(result.passed, true);
});

test("model fallback cannot pass stock clarification acceptance", () => {
  const result = stockClarificationAcceptance({ ...validResponse, source: "llm", llmFallback: true }, {
    responseOk: true,
    code: 0,
    answerIncludes: "product name or barcode",
  });

  assert.equal(result.passed, false);
  assert.equal(result.checks.deterministicNoFallback, false);
});

test("missing write evidence and an unexpected route fail acceptance", () => {
  const result = stockClarificationAcceptance({
    ...validResponse,
    ui: { route: "/admin" },
    writeRequests: undefined,
  }, { responseOk: true, code: 0, answerIncludes: "product name or barcode" });

  assert.equal(result.passed, false);
  assert.equal(result.checks.noRoute, false);
  assert.equal(result.checks.noWrites, false);
});

test("runtime must match source on both frontend and backend", () => {
  assert.equal(runtimeMatchesSource({ frontend: { commit: "abc" }, backend: { commit: "abc" } }, "abc"), true);
  assert.equal(runtimeMatchesSource({ frontend: { commit: "abc" }, backend: { commit: "def" } }, "abc"), false);
  assert.equal(runtimeMatchesSource({}, "abc"), false);
});

test("assistant runtime preflight reports mismatches before online cases are allowed", () => {
  const result = assistantRuntimePreflight({
    frontend: { commit: "abc" },
    backend: { commit: "old" },
  }, "abc");

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "RUNTIME_SHA_MISMATCH");
  assert.equal(result.frontendCommit, "abc");
  assert.equal(result.backendCommit, "old");
});
