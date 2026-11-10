export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { OdooRegisterPage } from "@/components/OdooRegisterPage";

/** Owner-locked shell: Odoo sell register. */
export default function RegisterRoute() {
  return <OdooRegisterPage />;
}
