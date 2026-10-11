import { SettingsScaffold, ToggleRow, SelectRow } from "@/components/admin/SettingsScaffold";

export default function StatementsPage() {
  return (
    <SettingsScaffold title="Statement Settings" sectionTitle="Statement Settings">
      <SelectRow label="Statement cycle" value="Monthly" />
      <SelectRow label="Statement due terms" value="30 Days" />
      <ToggleRow label="Email statements automatically" on />
      <ToggleRow label="Include zero-balance customers" />
    </SettingsScaffold>
  );
}
