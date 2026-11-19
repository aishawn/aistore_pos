import assert from "node:assert/strict";
import test from "node:test";

import { safeErrorSummary } from "./safe-error-summary.mjs";

test("redacts session headers and JWTs from request failures", () => {
  const summary = safeErrorSummary(new Error([
    "Request timed out",
    "cookie: orithos_access_token=eyJhbGci.eyJzdWI.abc; orithos_refresh_token=eyJhbGci.eyJzdWI.xyz",
    "authorization: Bearer eyJhbGci.eyJzdWI.secret",
    "remaining stack trace",
  ].join("\n")));

  assert.match(summary, /cookie: \[redacted\]/i);
  assert.match(summary, /authorization: \[redacted\]/i);
  assert.doesNotMatch(summary, /eyJhbGci/);
  assert.doesNotMatch(summary, /remaining stack trace/);
});
