import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Owner-locked: sales history lives under reports ledger view. */
export default function HistoryPage() {
  redirect("/reports/sales?view=ledger");
}
