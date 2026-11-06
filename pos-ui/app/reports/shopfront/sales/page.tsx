import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function ShopfrontSalesPage() {
  redirect("/reports/sales");
}
