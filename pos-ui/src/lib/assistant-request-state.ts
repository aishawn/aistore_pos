export type AssistantAbortReason = "user" | "timeout";

export function assistantAbortOutcome(reason: AssistantAbortReason): "cancelled" | "timeout" {
  return reason === "user" ? "cancelled" : "timeout";
}
