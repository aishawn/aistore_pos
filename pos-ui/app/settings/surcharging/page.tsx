import { SettingsScaffold, ToggleRow, SelectRow } from "@/components/admin/SettingsScaffold";

export default function SurchargingPage() {
  return (
    <SettingsScaffold title="Surcharging" sectionTitle="Surcharging">
      <ToggleRow label="Enable card surcharging" />
      <SelectRow label="Surcharge type" value="Percentage" />
      <SelectRow label="Public holiday surcharge" value="15%" />
      <ToggleRow label="Show surcharge on receipt" on />
    </SettingsScaffold>
  );
}
