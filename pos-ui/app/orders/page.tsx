import { OrithosPurchaseOrdersPage } from "@/components/OrithosPurchaseOrdersPage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function OrdersPage() {
  return <OrithosPurchaseOrdersPage />;
}
