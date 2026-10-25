import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getOdooQuoteTimeoutMessage, ODOO_QUOTE_TIMEOUT_MS } from "./odoo-quote-timeout.ts";

describe("quoteOdooPosOrder", () => {
  it("uses a finite deadline and provides a retryable timeout message", () => {
    assert.equal(ODOO_QUOTE_TIMEOUT_MS, 45_000);
    assert.equal(
      getOdooQuoteTimeoutMessage(new DOMException("signal timed out", "TimeoutError")),
      "Orithos did not return a cart total in time. Retry quote before finalising.",
    );
    assert.equal(getOdooQuoteTimeoutMessage(new Error("fetch failed")), null);
  });
});
