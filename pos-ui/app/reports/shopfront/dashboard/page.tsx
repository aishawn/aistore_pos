import { ShopfrontSourceDataPage } from "@/components/ShopfrontSourceDataPage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function ShopfrontDashboardPage() {
  return <ShopfrontSourceDataPage mode="dashboard" />;
}
