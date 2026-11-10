import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Legacy Shopfront dashboard URL → Orithos ledger reports dashboard. */
export default function ShopfrontDashboardPage() {
  redirect("/reports/dashboard");
}
