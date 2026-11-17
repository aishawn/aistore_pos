import assert from "node:assert/strict";
import test from "node:test";
import { sellDraftNoticePresentation } from "./sell-draft-notice.ts";

test("restored draft notice is polite and transient", () => {
  assert.deepEqual(sellDraftNoticePresentation("restored"), {
    persistent: false,
    role: "status",
    autoDismissMs: 6000,
  });
});

test("draft persistence errors remain visible as alerts", () => {
  for (const kind of ["expired", "read_error", "save_error"] as const) {
    assert.deepEqual(sellDraftNoticePresentation(kind), {
      persistent: true,
      role: "alert",
      autoDismissMs: null,
    });
  }
});
