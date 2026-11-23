import type { AssistantCard } from "@/lib/api";

export function retryQuestionForAssistantCards(
  cards: AssistantCard[] | null | undefined,
  question?: string,
): string | undefined {
  if (!question || !cards?.some((card) => card.status === "unavailable" && card.retryable !== false)) {
    return undefined;
  }
  return question;
}

export function restoredAssistantCardFields(
  cards: AssistantCard[] | null | undefined,
  previousQuestion?: string,
  metadata?: Partial<AssistantCard>,
): { cards?: AssistantCard[]; retryQuestion?: string } {
  if (!cards?.length) return {};
  const retryQuestion = retryQuestionForAssistantCards(cards, previousQuestion);
  const restoredCards = metadata && messageMetadataAppliesToCards(cards) ? cards.map((card) => ({
    ...card,
    dataAsOf: metadataValue(metadata, card, "dataAsOf"),
    dataSource: metadataValue(metadata, card, "dataSource"),
    storeScope: metadataValue(metadata, card, "storeScope"),
    reportPeriodFrom: metadataValue(metadata, card, "reportPeriodFrom"),
    reportPeriodTo: metadataValue(metadata, card, "reportPeriodTo"),
    reportTimeZone: metadataValue(metadata, card, "reportTimeZone"),
    reportDataStatus: metadataValue(metadata, card, "reportDataStatus"),
  })) : cards;
  return {
    cards: restoredCards,
    ...(retryQuestion ? { retryQuestion } : {}),
  };
}

export function messageMetadataAppliesToCards(cards: AssistantCard[]): boolean {
  return !cards.some((card) => card.type === "opportunities");
}

export function assistantCardMetadataValue<K extends keyof AssistantCard>(
  metadata: Partial<AssistantCard>,
  card: AssistantCard,
  key: K,
): AssistantCard[K] {
  return (Object.hasOwn(metadata, key) ? metadata[key] : card[key]) as AssistantCard[K];
}

function metadataValue<K extends keyof AssistantCard>(
  metadata: Partial<AssistantCard>,
  card: AssistantCard,
  key: K,
): AssistantCard[K] | null {
  return assistantCardMetadataValue(metadata, card, key) ?? null;
}
