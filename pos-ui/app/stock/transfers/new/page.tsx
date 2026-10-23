import { redirect } from "next/navigation";

export default function NewTransferRedirect() {
  redirect("/purchases/odoo?tab=transfer-new");
}
