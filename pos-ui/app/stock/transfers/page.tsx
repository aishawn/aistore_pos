import { redirect } from "next/navigation";

/** Transfers live under Purchases — keep this path for old links. */
export default function TransfersRedirect() {
  redirect("/purchases/odoo?tab=transfers");
}
