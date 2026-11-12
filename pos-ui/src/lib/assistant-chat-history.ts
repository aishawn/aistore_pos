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
  const restoredCards = metadata ? cards.map((card) => ({
    ...card,
    dataAsOf: card.dataAsOf ?? metadata.dataAsOf ?? null,
    dataSource: card.dataSource ?? metadata.dataSource ?? null,
    storeScope: card.storeScope ?? metadata.storeScope ?? null,
    reportPeriodFrom: card.reportPeriodFrom ?? metadata.reportPeriodFrom ?? null,
    reportPeriodTo: card.reportPeriodTo ?? metadata.reportPeriodTo ?? null,
    reportTimeZone: card.reportTimeZone ?? metadata.reportTimeZone ?? null,
    reportDataStatus: card.reportDataStatus ?? metadata.reportDataStatus ?? null,
  })) : cards;
  return {
    cards: restoredCards,
    ...(retryQuestion ? { retryQuestion } : {}),
  };
}
