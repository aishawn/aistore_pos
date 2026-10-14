import { OdooPosConnectionCard } from "@/components/OdooPosConnectionCard";
import { R2ArchiveSyncCard } from "@/components/R2ArchiveSyncCard";
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
        <div className="mt-4"><R2ArchiveSyncCard /></div>
      </div>
    </CompanySettingsScaffold>
  );
}
