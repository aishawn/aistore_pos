import {
  claimEftposAttemptDispatch,
  createEftposAttempt,
  getEftposAttemptByOrder,
  type EftposAttempt,
} from "./eftpos-api";
import { fetchConnectorStatus, requestConnectorPurchase, requestConnectorQuery } from "./linkly-connector";

const DISPATCH_KEY_PREFIX = "orithos.eftpos.purchase-dispatched.";

type PurchaseStorageLike = Pick<Storage, "getItem" | "setItem">;

function browserPurchaseStorage(): PurchaseStorageLike | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function wasPurchaseDispatched(orderUuid: string, storage = browserPurchaseStorage()): boolean {
  return storage?.getItem(`${DISPATCH_KEY_PREFIX}${orderUuid}`) === "1";
}

export function markPurchaseDispatched(orderUuid: string, storage = browserPurchaseStorage()) {
  if (!storage) throw new Error("This browser cannot safely track EFTPOS dispatch state. Enable local storage before retrying this payment.");
  storage.setItem(`${DISPATCH_KEY_PREFIX}${orderUuid}`, "1");
}

export async function dispatchClaimedPurchase(
  claimDispatch: () => Promise<{ dispatchAuthorized: boolean }>,
  dispatchPurchase: () => Promise<void>,
): Promise<boolean> {
  const claim = await claimDispatch();
  if (!claim.dispatchAuthorized) return false;
  await dispatchPurchase();
  return true;
}

async function dispatchConnector(attempt: EftposAttempt, registerId: number): Promise<void> {
  if (attempt.status === "PENDING") {
    if (wasPurchaseDispatched(attempt.orderUuid)) {
      await requestConnectorQuery(attempt.connectorBaseUrl, {
        attemptId: attempt.attemptId,
        orderUuid: attempt.orderUuid,
        connectorChallenge: attempt.connectorChallenge,
      });
      return;
    }
    const status = await fetchConnectorStatus(attempt.connectorBaseUrl);
    if (status?.integrationMode !== "tcp-proxy" || status.tokenConfigured !== true) {
      throw new Error("Real Linkly is not ready on this PC. The payment was not sent to the terminal; keep this order and resolve the connector status before retrying.");
    }
    const dispatched = await dispatchClaimedPurchase(
      () => claimEftposAttemptDispatch(registerId, attempt.attemptId),
      () => requestConnectorPurchase(attempt.connectorBaseUrl, {
        attemptId: attempt.attemptId,
        orderUuid: attempt.orderUuid,
        amountCents: attempt.amountCents,
        currency: attempt.currency,
        connectorChallenge: attempt.connectorChallenge,
      }, () => markPurchaseDispatched(attempt.orderUuid)),
    );
    if (!dispatched) {
      await requestConnectorQuery(attempt.connectorBaseUrl, {
        attemptId: attempt.attemptId,
        orderUuid: attempt.orderUuid,
        connectorChallenge: attempt.connectorChallenge,
      });
      return;
    }
    return;
  }
  if (attempt.status === "DISPATCHED" || attempt.status === "UNKNOWN") {
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

  await dispatchConnector(attempt, input.registerId);

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
    if (attempt.status === "DISPATCHED" || attempt.status === "UNKNOWN") {
      await dispatchConnector(attempt, input.registerId);
    }
  }
  throw new Error("Payment is still pending on the terminal. Do not charge again; wait or check the terminal.");
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
