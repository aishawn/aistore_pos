import { OdooPurchaseOrdersPage } from "@/components/OdooPurchaseOrdersPage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function OrdersPage() {
  return <OdooPurchaseOrdersPage />;
}
