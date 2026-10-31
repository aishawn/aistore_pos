import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RfqJournal } from "./rfq-idempotency.ts";

test("RFQ reservation survives new clients, rejects changed quantities and isolates stores", () => {
  const dir = mkdtempSync(join(tmpdir(), "rfq-journal-"));
  try {
    const a = new RfqJournal(join(dir, "requests.sqlite"));
    const b = new RfqJournal(join(dir, "requests.sqlite"));
    assert.equal(a.reserve("demo:127", "request-1", "quantity-1").state, "NEW");
    assert.equal(b.reserve("demo:127", "request-1", "quantity-1").state, "PENDING");
    assert.equal(b.reserve("demo:127", "request-1", "quantity-2").state, "CONFLICT");
    assert.equal(b.reserve("other:128", "request-1", "quantity-1").state, "NEW");
    const response = { status: 201, body: { id: 123, auditSaved: true, readbackVerified: true } };
    a.complete("demo:127", "request-1", "quantity-1", response);
    assert.deepEqual(b.reserve("demo:127", "request-1", "quantity-1"), { state: "DONE", response });
    assert.throws(() => b.complete("demo:127", "request-1", "quantity-1", response));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
