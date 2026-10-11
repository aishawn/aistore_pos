import { SettingsScaffold, ToggleRow, SelectRow } from "@/components/admin/SettingsScaffold";

export default function PriceSetsPage() {
  return (
    <SettingsScaffold title="Price Sets" sectionTitle="Price Sets">
      <SelectRow label="Default price set" value="Standard Retail" />
      <ToggleRow label="Allow per-outlet pricing" on />
      <ToggleRow label="Round to nearest 5 cents" on />
      <SelectRow label="Tax handling" value="Inclusive" />
    </SettingsScaffold>
  );
}
