import { ShopfrontSourceDataPage } from "@/components/ShopfrontSourceDataPage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function ShopfrontSalesPage() {
  return <ShopfrontSourceDataPage mode="sales" />;
}
