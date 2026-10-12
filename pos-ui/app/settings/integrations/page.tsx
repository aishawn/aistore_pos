import { SettingsScaffold } from "@/components/admin/SettingsScaffold";
import { OdooPosConnectionCard } from "@/components/OdooPosConnectionCard";

export default function IntegrationsPage() {
  return (
    <SettingsScaffold title="Integrations" sectionTitle="Integrations">
      <div className="grid gap-4">
        <OdooPosConnectionCard />
        <p className="px-1 text-xs leading-5 text-[var(--oh-muted)]">
          Odoo sign-in is held in a protected server cookie. The POS server must have ODOO_BASE_URL and ODOO_DATABASE configured before connecting.
        </p>
      </div>
    </SettingsScaffold>
  );
}
