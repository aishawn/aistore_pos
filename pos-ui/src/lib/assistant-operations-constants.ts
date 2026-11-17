export type OperationsPreview = "replenishment" | "sales_week" | "opportunities";

export const OPERATIONS_PREVIEW_CANONICAL: Record<OperationsPreview, string> = {
  replenishment: "Analyse low stock items and suggest what to reorder",
  sales_week: "Show me this week's sales performance",
  opportunities: "Suggest ways to grow my store",
};