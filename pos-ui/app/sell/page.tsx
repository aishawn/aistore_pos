export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { OrithosRegisterPage } from "@/components/OrithosRegisterPage";

/** Keep the named Sell URL on the same native register as /. */
export default function SellRoute() {
  return <OrithosRegisterPage />;
}
