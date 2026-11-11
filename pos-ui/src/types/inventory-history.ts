export type InventoryHistoryStatus = {
  status: "UNAVAILABLE" | "FRESH" | "STALE" | "REVIEW";
  lastSuccessAt?: string;
  latestBusinessDate?: string;
  firstBusinessDate?: string;
  lastAttemptAt?: string;
  lastAttemptStatus?: string;
  businessTimezone?: string;
  expectedProducts?: number;
  capturedProducts?: number;
  productCoverage?: number;
  expectedWarehouses?: number;
  capturedWarehouses?: number;
  missingFields?: Record<string, number>;
  missingWarehouseQuantityFields?: number;
  observedDays?: number;
  gapDays?: number;
  invalidSnapshots?: number;
  supplierLeadTimeCoverage?: {
    quality?: string;
    supplierInfoRows?: number | null;
    productsWithLeadTime?: number;
    productsMissingLeadTime?: number;
  };
};
