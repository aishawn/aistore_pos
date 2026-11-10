import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Legacy Odoo sales-history path — Orithos ledger lives under reports. */
export default function OdooSalesHistoryRoute() {
  redirect("/reports/sales?view=ledger");
}
