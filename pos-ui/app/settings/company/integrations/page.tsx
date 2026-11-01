import { OdooPosConnectionCard } from "@/components/OdooPosConnectionCard";
import { CompanySettingsScaffold } from "@/components/admin/CompanySettingsScaffold";

const HREF = "/settings/company/integrations";

export default function IntegrationsCompanySettingsPage() {
  return (
    <CompanySettingsScaffold
      subSectionTitle="Integrations"
      activeHref={HREF}
      showSearch={false}
      showSave={false}
    >
      <div className="mx-auto w-full max-w-5xl">
        <OdooPosConnectionCard />
      </div>
    </CompanySettingsScaffold>
  );
}
