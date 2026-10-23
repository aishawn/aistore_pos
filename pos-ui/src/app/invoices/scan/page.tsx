import { redirect } from "next/navigation";

/** Legacy AI / bookmark path — invoices now live under Stock → Invoices. */
export default function LegacyInvoiceScanRedirect() {
  redirect("/invoices/new");
}
