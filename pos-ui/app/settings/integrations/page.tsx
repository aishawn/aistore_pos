import { SettingsScaffold } from "@/components/admin/SettingsScaffold";
import { OdooPosConnectionCard } from "@/components/OdooPosConnectionCard";
import { R2ArchiveSyncCard } from "@/components/R2ArchiveSyncCard";

export default function IntegrationsPage() {
  return (
    <SettingsScaffold title="Integrations" showSubSectionTitle={false} showSearch={false} showSave={false}>
      <div className="grid gap-4">
        <OdooPosConnectionCard />
        <R2ArchiveSyncCard />
      </div>
    </SettingsScaffold>
  );
}
