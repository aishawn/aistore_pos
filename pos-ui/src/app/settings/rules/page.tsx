import { SettingsScaffold, ToggleRow, SelectRow } from "@/components/admin/SettingsScaffold";

export default function PageRulesPage() {
  return (
    <SettingsScaffold title="Page Rules" sectionTitle="Page Rules">
      <ToggleRow label="Require reason for refunds" on />
      <ToggleRow label="Require manager approval for voids" on />
      <SelectRow label="Default landing page" value="Sell Screen" />
      <ToggleRow label="Lock register after inactivity" />
    </SettingsScaffold>
  );
}
