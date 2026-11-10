export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { OdooRegisterPage } from "@/components/OdooRegisterPage";

/** Owner-locked shell: keep named Sell URL on the same Odoo register as /. */
export default function SellRoute() {
  return <OdooRegisterPage />;
}
