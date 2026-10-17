export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { SettingsScaffold, ToggleRow, SelectRow } from "@/components/admin/SettingsScaffold";

export default function PushNotificationsPage() {
  return (
    <SettingsScaffold title="Push Notifications" sectionTitle="Push Notifications">
      <ToggleRow label="Low stock alerts" on />
      <ToggleRow label="End of day summary" on />
      <ToggleRow label="Refund notifications" />
      <SelectRow label="Delivery channel" value="Email & Push" />
    </SettingsScaffold>
  );
}
