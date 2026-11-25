import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { requestConnectorPurchase } from "./linkly-connector.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const purchase = {
  attemptId: 12,
  orderUuid: "order-12",
  amountCents: 100,
  currency: "AUD",
  connectorChallenge: "challenge",
};

test("marks a purchase dispatched before the request can lose its response", async () => {
  const events: string[] = [];
  globalThis.fetch = async () => {
    events.push("fetch");
    throw new TypeError("Network response was lost");
  };

  await assert.rejects(requestConnectorPurchase("http://127.0.0.1:9167", purchase, () => events.push("dispatch")));

  assert.deepEqual(events, ["dispatch", "fetch"]);
});

test("marks rejected HTTP responses as dispatched for transaction reconciliation", async () => {
  let dispatched = false;
  globalThis.fetch = async () => new Response("adapter timeout", { status: 502 });

  await assert.rejects(
    requestConnectorPurchase("http://127.0.0.1:9167", purchase, () => { dispatched = true; }),
    /adapter timeout/,
  );

  assert.equal(dispatched, true);
});
