import { CompanySettingsScaffold, ToggleRow } from "@/components/admin/CompanySettingsScaffold";

const HREF = "/settings/company/integrations";

export default function IntegrationsCompanySettingsPage() {
  return (
    <CompanySettingsScaffold subSectionTitle="Integrations" activeHref={HREF}>
      <ToggleRow label="Metcash host file integration" />
    </CompanySettingsScaffold>
  );
}
