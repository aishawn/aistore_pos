import { redirect } from "next/navigation";

/** Keep legacy src/app route in sync with canonical app/history redirect. */
export default function HistoryRedirectPage() {
  redirect("/history/odoo");
}
