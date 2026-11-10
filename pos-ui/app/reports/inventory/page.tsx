import { NativeInventoryReportPage } from "@/components/NativeInventoryReportPage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Inventory report reads Orithos on-hand. ShopfrontSourceDataPage depends on retired /api/shopfront-source. */
export default function InventoryReportsPage() {
  return <NativeInventoryReportPage />;
}
