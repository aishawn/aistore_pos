export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { OdooRegisterPage } from "@/components/OdooRegisterPage";

/** Keep the named Sell URL on the same production register implementation as /. */
export default function SellRoute() {
  return <OdooRegisterPage />;
}
