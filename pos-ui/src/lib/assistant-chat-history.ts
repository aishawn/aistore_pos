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
): { cards?: AssistantCard[]; retryQuestion?: string } {
  if (!cards?.length) return {};
  const retryQuestion = retryQuestionForAssistantCards(cards, previousQuestion);
  return {
    cards,
    ...(retryQuestion ? { retryQuestion } : {}),
  };
}
