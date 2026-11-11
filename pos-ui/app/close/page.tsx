export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { OdooCloseRegisterPage } from "@/components/OdooCloseRegisterPage";

/** Owner-locked shell: pair close-register with the current sell UI. */
export default function CloseRegisterPage() {
  return <OdooCloseRegisterPage />;
}
