import { CompanySettingsScaffold, SelectRow, TextRow, ToggleRow } from "@/components/admin/CompanySettingsScaffold";

const HREF = "/settings/company/miscellaneous";

export default function MiscellaneousSettingsPage() {
  return (
    <CompanySettingsScaffold subSectionTitle="Miscellaneous" activeHref={HREF}>
      <SelectRow label="Default sale keys" value="Home Keys" />
      <SelectRow label="Sale keys position" value="Left" />
      <ToggleRow label="Price change notifications" />
      <TextRow label='Global statement "Reply To" email' value="" />
      <ToggleRow label="Show average cost on price editor when editing orders" on />
      <ToggleRow label="Default new users to reporting access for all outlets" on />
      <SelectRow label="Debug logging level" value="Normal" />
    </CompanySettingsScaffold>
  );
}
