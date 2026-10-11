import { CompanySettingsScaffold, ToggleRow } from "@/components/admin/CompanySettingsScaffold";

const HREF = "/settings/company/outlets";

export default function OutletsCompanySettingsPage() {
  return (
    <CompanySettingsScaffold subSectionTitle="Outlets" activeHref={HREF}>
      <ToggleRow label="Share parked sales between outlets" on />
      <ToggleRow label="Share gift cards between outlets" on />
    </CompanySettingsScaffold>
  );
}
