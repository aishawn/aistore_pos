import { redirect } from "next/navigation";
import { DEVICES_HUB_DEFAULT } from "@/lib/setup-hub-nav";

/** Setup → Devices hub: default to Receipts. */
export default function DevicesSettingsHubPage() {
  redirect(DEVICES_HUB_DEFAULT);
}