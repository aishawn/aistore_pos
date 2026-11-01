import { GiftCardCapabilityCard } from "@/components/GiftCardCapabilityCard";
import { SettingsScaffold } from "@/components/admin/SettingsScaffold";

export default function IntegrationsPage() {
  return (
    <SettingsScaffold title="Integrations" showSubSectionTitle={false} showSearch={false} showSave={false}>
      <div className="grid gap-4">
        <GiftCardCapabilityCard />
      </div>
    </SettingsScaffold>
  );
}
