import { SettingsScaffold, ToggleRow, SelectRow } from "@/components/admin/SettingsScaffold";

export default function ReceiptsPage() {
  return (
    <SettingsScaffold title="Receipt Settings" sectionTitle="Receipt Settings">
      <ToggleRow label="Print receipt automatically" on />
      <ToggleRow label="Email receipt to customer" />
      <SelectRow label="Receipt paper size" value="80mm" />
      <SelectRow label="Logo position" value="Centered" />
      <ToggleRow label="Show tax breakdown" on />
      <ToggleRow label="Show savings line" />
    </SettingsScaffold>
  );
}
