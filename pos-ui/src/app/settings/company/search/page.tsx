import { CompanySettingsScaffold, SelectRow } from "@/components/admin/CompanySettingsScaffold";

const HREF = "/settings/company/search";

export default function SearchSettingsPage() {
  return (
    <CompanySettingsScaffold subSectionTitle="Search" activeHref={HREF}>
      <SelectRow label="Customer search level" value="Full" />
      <SelectRow label="Product search level" value="Full" />
      <SelectRow label="Search cache save location" value="Local Database" />
    </CompanySettingsScaffold>
  );
}
