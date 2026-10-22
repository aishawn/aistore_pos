import { redirect } from "next/navigation";
import { STORE_HUB_DEFAULT } from "@/lib/setup-hub-nav";

/** Setup → Store hub: default to Registers & Outlets. */
export default function StoreSettingsHubPage() {
  redirect(STORE_HUB_DEFAULT);
}
