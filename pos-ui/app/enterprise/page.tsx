import { SettingsScaffold, ToggleRow, SelectRow } from "@/components/admin/SettingsScaffold";

export default function EnterprisePoliciesPage() {
  return (
    <SettingsScaffold title="Enterprise Policies" sectionTitle="Enterprise Policies">
      <ToggleRow label="Enforce centralised pricing" on />
      <ToggleRow label="Lock product edits to head office" on />
      <SelectRow label="Data sync scope" value="All Outlets" />
      <ToggleRow label="Allow local promotions" />
    </SettingsScaffold>
  );
}
