export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { OdooRegisterPage } from "@/components/OdooRegisterPage";

/** Owner-locked shell: keep the named Sell URL on the same register as /. */
export default function SellRoute() {
  return <OdooRegisterPage />;
}
