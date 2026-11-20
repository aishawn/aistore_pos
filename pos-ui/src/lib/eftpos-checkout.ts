import {
  createEftposAttempt,
  getEftposAttemptByOrder,
  type EftposAttempt,
} from "./eftpos-api";
import { requestConnectorPurchase, requestConnectorQuery } from "./linkly-connector";

const DISPATCH_KEY_PREFIX = "orithos.eftpos.purchase-dispatched.";

type SessionStorageLike = Pick<Storage, "getItem" | "setItem">;

function browserSessionStorage(): SessionStorageLike | null {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

export function wasPurchaseDispatched(orderUuid: string, storage = browserSessionStorage()): boolean {
  return storage?.getItem(`${DISPATCH_KEY_PREFIX}${orderUuid}`) === "1";
}

export function markPurchaseDispatched(orderUuid: string, storage = browserSessionStorage()) {
  storage?.setItem(`${DISPATCH_KEY_PREFIX}${orderUuid}`, "1");
}

async function dispatchConnector(attempt: EftposAttempt): Promise<void> {
  if (attempt.status === "PENDING") {
    if (wasPurchaseDispatched(attempt.orderUuid)) return;
    await requestConnectorPurchase(attempt.connectorBaseUrl, {
      attemptId: attempt.attemptId,
      orderUuid: attempt.orderUuid,
      amountCents: attempt.amountCents,
      currency: attempt.currency,
      connectorChallenge: attempt.connectorChallenge,
    });
    markPurchaseDispatched(attempt.orderUuid);
    return;
  }
  if (attempt.status === "UNKNOWN") {
    await requestConnectorQuery(attempt.connectorBaseUrl, {
      attemptId: attempt.attemptId,
      orderUuid: attempt.orderUuid,
      connectorChallenge: attempt.connectorChallenge,
    });
  }
}

export async function ensureEftposApprovedBeforeCheckout(input: {
  registerId: number;
  orderUuid: string;
  expectedTotal: number;
  quoteSignature: string | null;
  onStatus?: (attempt: EftposAttempt) => void;
}): Promise<EftposAttempt> {
  let attempt = await createEftposAttempt(input.registerId, {
    orderUuid: input.orderUuid,
    expectedTotal: input.expectedTotal,
    quoteSignature: input.quoteSignature,
  });
  input.onStatus?.(attempt);

  if (attempt.status === "APPROVED" || attempt.status === "APPROVED_PENDING_SETTLEMENT") {
    return attempt;
  }
  if (attempt.status === "DECLINED" || attempt.status === "CANCELLED") {
    throw new Error("The terminal declined or cancelled the payment.");
  }

  await dispatchConnector(attempt);

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await pause(1_500);
    attempt = await getEftposAttemptByOrder(input.registerId, input.orderUuid);
    input.onStatus?.(attempt);
    if (attempt.status === "APPROVED" || attempt.status === "APPROVED_PENDING_SETTLEMENT") {
      return attempt;
    }
    if (attempt.status === "DECLINED" || attempt.status === "CANCELLED") {
      throw new Error("The terminal declined or cancelled the payment.");
    }
    if (attempt.status === "UNKNOWN") {
      await dispatchConnector(attempt);
    }
  }
  throw new Error("Payment is still pending on the terminal. Do not charge again; wait or check the terminal.");
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
