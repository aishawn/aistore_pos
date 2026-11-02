export type WorkspaceRecordType = "lines" | "payments" | "inventory" | "catalogue";

export interface WorkspaceRecords {
  columns: { key: string; label: string; format?: "money" | "date" }[];
  items: { id: number; [key: string]: unknown }[];
  hasNext: boolean;
  timezone: string;
  currency: string;
}
