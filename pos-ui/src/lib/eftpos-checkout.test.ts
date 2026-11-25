import assert from "node:assert/strict";
import test from "node:test";
import { dispatchClaimedPurchase, markPurchaseDispatched, wasPurchaseDispatched } from "./eftpos-checkout.ts";

test("purchase dispatch marker is isolated per order and survives resume checks", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  assert.equal(wasPurchaseDispatched("order-a", storage), false);
  markPurchaseDispatched("order-a", storage);
  assert.equal(wasPurchaseDispatched("order-a", storage), true);
  assert.equal(wasPurchaseDispatched("order-b", storage), false);
});

test("requests purchase only after the server grants the one-time dispatch claim", async () => {
  const events: string[] = [];

  const dispatched = await dispatchClaimedPurchase(
    async () => {
      events.push("claim");
      return { dispatchAuthorized: true };
    },
    async () => { events.push("purchase"); },
  );

  assert.equal(dispatched, true);
  assert.deepEqual(events, ["claim", "purchase"]);
});

test("does not send another purchase when another checkout owns the dispatch claim", async () => {
  let purchaseSent = false;

  const dispatched = await dispatchClaimedPurchase(
    async () => ({ dispatchAuthorized: false }),
    async () => { purchaseSent = true; },
  );

  assert.equal(dispatched, false);
  assert.equal(purchaseSent, false);
});
