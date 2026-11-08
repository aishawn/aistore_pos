export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { OrithosRegisterRoute } from "@/components/OrithosRegisterRoute";

/** Keep the named Sell URL on the same production register implementation as /. */
export default function SellRoute() {
  return <OrithosRegisterRoute />;
}
