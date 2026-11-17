import type { AssistantResponse } from "./api.ts";
import { OPERATIONS_PREVIEW_CANONICAL, type OperationsPreview } from "./assistant-operations-constants.ts";

export const SESSION_WARM_CACHE = "session_warm_cache";
export const STALE_CARD_CACHE = "stale_card_cache";

const STALE_TTL_MS = 5 * 60 * 1000;
const WARM_SERVE_MS = 90_000;

type SnapshotEntry = {
  response: AssistantResponse;
  capturedAt: number;
};

const snapshots = new Map<OperationsPreview, SnapshotEntry>();
const inflight = new Map<OperationsPreview, Promise<AssistantResponse | null>>();

export function clearOperationsPreviewSnapshots() {
  snapshots.clear();
  inflight.clear();
}

/** Test helper: move snapshot age past the warm-serve window but inside stale TTL. */
export function ageOperationsPreviewSnapshot(intent: OperationsPreview, ageMs: number) {
  const entry = snapshots.get(intent);
  if (!entry) return;
  snapshots.set(intent, { ...entry, capturedAt: Date.now() - ageMs });
}

function cloneResponse(response: AssistantResponse, dataSource: string, partialNote?: string): AssistantResponse {
  const cards = response.cards?.map((card) => ({
    ...card,
    dataSource,
    source: dataSource,
    status: dataSource === STALE_CARD_CACHE ? "partial" as const : card.status,
    summary: partialNote && card.summary ? `${card.summary}\n${partialNote}` : card.summary,
  }));
  return {
    ...response,
    dataSource,
    cards: cards ?? response.cards,
    answer: partialNote && response.answer ? `${response.answer}\n${partialNote}` : response.answer,
    reportDataStatus: dataSource === STALE_CARD_CACHE ? "incomplete" : response.reportDataStatus,
  };
}

export function storeOperationsPreviewSnapshot(intent: OperationsPreview, response: AssistantResponse) {
  if (response.cards?.some((card) => card.status === "unavailable")) return;
  snapshots.set(intent, { response: structuredClone(response), capturedAt: Date.now() });
}

export function warmOperationsPreviewSnapshot(intent: OperationsPreview): AssistantResponse | null {
  const entry = snapshots.get(intent);
  if (!entry || Date.now() - entry.capturedAt > WARM_SERVE_MS) return null;
  return cloneResponse(entry.response, SESSION_WARM_CACHE);
}

export function staleOperationsPreviewSnapshot(
  intent: OperationsPreview,
  chinese: boolean,
): AssistantResponse | null {
  const entry = snapshots.get(intent);
  if (!entry || Date.now() - entry.capturedAt > STALE_TTL_MS) return null;
  const asOf = entry.response.dataAsOf ?? entry.response.cards?.[0]?.dataAsOf;
  const note = chinese
    ? asOf
      ? `实时查询失败；以下为截至 ${asOf} 的上次可用结果，请人工核对。`
      : "实时查询失败；以下为上次可用结果，请人工复核。"
    : asOf
      ? `Live query failed; showing the last available result as of ${asOf}. Review before acting.`
      : "Live query failed; showing the last available result. Review before acting.";
  return cloneResponse(entry.response, STALE_CARD_CACHE, note);
}

export function registerOperationsPreviewInflight(
  intent: OperationsPreview,
  task: Promise<AssistantResponse | null>,
) {
  inflight.set(intent, task);
  void task.finally(() => {
    if (inflight.get(intent) === task) inflight.delete(intent);
  });
  return task;
}

export async function awaitOperationsPreviewInflight(intent: OperationsPreview): Promise<void> {
  const pending = inflight.get(intent);
  if (pending) await pending.catch(() => undefined);
}

export function prefetchOperationsPreviews(
  reader: (question: string, signal?: AbortSignal) => Promise<AssistantResponse | null>,
  signal?: AbortSignal,
) {
  for (const intent of ["replenishment", "sales_week", "opportunities"] as const) {
    const question = OPERATIONS_PREVIEW_CANONICAL[intent];
    const task = reader(question, signal);
    registerOperationsPreviewInflight(intent, task.then((result) => {
      if (result) storeOperationsPreviewSnapshot(intent, result);
      return result;
    }));
  }
}