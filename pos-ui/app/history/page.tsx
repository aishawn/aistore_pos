import { redirect } from "next/navigation";

/** Classic MySQL sales history is retired for the pilot; send users to Odoo History. */
export default function HistoryRedirectPage() {
  redirect("/history/odoo");
}
