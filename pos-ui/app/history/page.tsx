import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function HistoryPage() {
  redirect("/reports/sales?view=ledger");
}
