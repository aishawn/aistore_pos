import { OutletSettingsScaffold, SelectRow, TextRow, ToggleRow } from "@/components/admin/OutletSettingsScaffold";

const HREF = "/settings/outlets/integrations";

export default function OutletIntegrationsSettingsPage() {
  return (
    <OutletSettingsScaffold subSectionTitle="Integrations" activeHref={HREF}>
      <ToggleRow label="Use global cost" on />
      <SelectRow label="Email receipt template" value="Email Receipt" />
      <TextRow label="Outlet email" value="blueoceanmel@gmail.com" />
    </OutletSettingsScaffold>
  );
}
