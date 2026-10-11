import { OutletSettingsScaffold, ToggleRow } from "@/components/admin/OutletSettingsScaffold";

const HREF = "/settings/outlets/transfers";

export default function OutletTransfersSettingsPage() {
  return (
    <OutletSettingsScaffold subSectionTitle="Transfers" activeHref={HREF}>
      <ToggleRow label="Update last cost when receiving transfers" on />
    </OutletSettingsScaffold>
  );
}
