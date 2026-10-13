import { SettingsScaffold } from "@/components/admin/SettingsScaffold";
import { OdooPosConnectionCard } from "@/components/OdooPosConnectionCard";

export default function IntegrationsPage() {
  return (
    <SettingsScaffold title="Integrations" sectionTitle="Integrations">
      <div className="grid gap-4">
        <OdooPosConnectionCard />
        <p className="px-1 text-xs leading-5 text-[var(--oh-muted)]">
          Odoo sessions are held in a protected server cookie. To restore the connection automatically after a session expires or a browser cookie is cleared, configure ODOO_SERVICE_USERNAME and ODOO_SERVICE_PASSWORD in Dokploy. Use a dedicated Odoo POS account with only the access this store needs; keep the password in Dokploy, never in Git.
        </p>
      </div>
    </SettingsScaffold>
  );
}
