import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Purchase report URL folds into purchasing workspace (Shopfront source report API retired). */
export default function PurchaseReportsPage() {
  redirect("/purchases");
}
