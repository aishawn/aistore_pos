import { SettingsScaffold, ToggleRow, SelectRow } from "@/components/admin/SettingsScaffold";

export default function CustomerDisplayPage() {
  return (
    <SettingsScaffold title="Customer Display" sectionTitle="Customer Display">
      <ToggleRow label="Enable customer display" on />
      <SelectRow label="Idle screen" value="Store Logo" />
      <SelectRow label="Theme" value="Default" />
      <ToggleRow label="Show running total" on />
      <ToggleRow label="Show promotional media" />
    </SettingsScaffold>
  );
}
