export type SellDraftNoticeKind = "restored" | "expired" | "read_error" | "save_error";

export function sellDraftNoticePresentation(kind: SellDraftNoticeKind) {
  const persistent = kind !== "restored";
  return {
    persistent,
    role: persistent ? "alert" as const : "status" as const,
    autoDismissMs: persistent ? null : 6000,
  };
}
