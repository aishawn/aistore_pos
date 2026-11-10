import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Legacy Odoo customers path — Orithos directory lives at /customers. */
export default function OdooCustomerDirectoryRoute() {
  redirect("/customers");
}
