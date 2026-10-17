export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { SettingsScaffold, ToggleRow, SelectRow } from "@/components/admin/SettingsScaffold";

export default function LoyaltyPage() {
  return (
    <SettingsScaffold title="Loyalty Settings" sectionTitle="Loyalty Settings">
      <ToggleRow label="Enable loyalty program" on />
      <SelectRow label="Points earned per dollar" value="1 Point" />
      <SelectRow label="Redemption rate" value="100 Points = $1.00" />
      <ToggleRow label="Allow partial redemption" on />
      <ToggleRow label="Notify customers of balance" />
    </SettingsScaffold>
  );
}
