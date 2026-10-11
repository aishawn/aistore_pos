import { NumberRow, OutletSettingsScaffold, SelectRow, ToggleRow } from "@/components/admin/OutletSettingsScaffold";

const HREF = "/settings/outlets/gift-cards";

export default function OutletGiftCardsSettingsPage() {
  return (
    <OutletSettingsScaffold subSectionTitle="Gift Cards" activeHref={HREF}>
      <ToggleRow label="Enable gift cards" on />
      <NumberRow label="Default expiry amount" value={3} />
      <SelectRow label="Default expiry period" value="Years" />
      <ToggleRow label="Can manually adjust expiry" on />
    </OutletSettingsScaffold>
  );
}
