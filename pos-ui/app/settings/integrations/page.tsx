import { SettingsScaffold } from "@/components/admin/SettingsScaffold";
import { OdooPosConnectionCard } from "@/components/OdooPosConnectionCard";

export default function IntegrationsPage() {
  return (
    <SettingsScaffold title="Integrations" showSubSectionTitle={false} showSave={false}>
      <div className="grid gap-4">
        <OdooPosConnectionCard />
      </div>
    </SettingsScaffold>
  );
}
