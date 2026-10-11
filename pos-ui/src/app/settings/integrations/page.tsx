import { SettingsScaffold, ToggleRow, SelectRow } from "@/components/admin/SettingsScaffold";

export default function IntegrationsPage() {
  return (
    <SettingsScaffold title="Integrations" sectionTitle="Integrations">
      <ToggleRow label="Xero accounting sync" />
      <ToggleRow label="MYOB sync" />
      <ToggleRow label="Tyro EFTPOS" on />
      <SelectRow label="Sync frequency" value="Every 15 minutes" />
    </SettingsScaffold>
  );
}
