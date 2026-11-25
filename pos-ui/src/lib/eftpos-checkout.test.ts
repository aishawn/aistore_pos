import assert from "node:assert/strict";
import test from "node:test";
import { dispatchClaimedPurchase, loadOrCreateAttemptWithPreflight, markPurchaseDispatched, shouldShowPendingEftposDialog, wasPurchaseDispatched } from "./eftpos-checkout.ts";

test("dismissing a pending EFTPOS dialog hides only that order and allows reopening", () => {
  const pendingOrderUuid = "order-pending";

  assert.equal(shouldShowPendingEftposDialog(pendingOrderUuid, null), true);
  assert.equal(shouldShowPendingEftposDialog(pendingOrderUuid, pendingOrderUuid), false);
  assert.equal(shouldShowPendingEftposDialog(pendingOrderUuid, null), true);
  assert.equal(shouldShowPendingEftposDialog(null, pendingOrderUuid), false);
});

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

test("recovers an existing attempt without blocking it on a new-payment preflight", async () => {
  const events: string[] = [];
  const existing = { status: "UNKNOWN" };

  const attempt = await loadOrCreateAttemptWithPreflight(
    async () => { events.push("lookup"); return existing; },
    async () => { events.push("preflight"); return "adapter offline"; },
    async () => { events.push("create"); return { status: "PENDING" }; },
  );

  assert.equal(attempt, existing);
  assert.deepEqual(events, ["lookup"]);
});

test("does not create a payment attempt when adapter preflight fails", async () => {
  const events: string[] = [];

  await assert.rejects(loadOrCreateAttemptWithPreflight(
    async () => { events.push("lookup"); return null; },
    async () => { events.push("preflight"); return "adapter offline"; },
    async () => { events.push("create"); return { status: "PENDING" }; },
  ), /adapter offline/);

  assert.deepEqual(events, ["lookup", "preflight"]);
});

test("checks readiness before creating a first payment attempt", async () => {
  const events: string[] = [];

  const attempt = await loadOrCreateAttemptWithPreflight(
    async () => { events.push("lookup"); return null; },
    async () => { events.push("preflight"); return null; },
    async () => { events.push("create"); return { status: "PENDING" }; },
  );

  assert.equal(attempt.status, "PENDING");
  assert.deepEqual(events, ["lookup", "preflight", "create"]);
});
