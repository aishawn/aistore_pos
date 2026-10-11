import { OutletSettingsScaffold, SelectRow } from "@/components/admin/OutletSettingsScaffold";

const HREF = "/settings/outlets/miscellaneous";

export default function OutletMiscellaneousSettingsPage() {
  return (
    <OutletSettingsScaffold subSectionTitle="Miscellaneous" activeHref={HREF}>
      <SelectRow label="Discounting below cost behaviour" value="Allow" />
      <SelectRow label="Sale keys" value="Default" />
      <SelectRow label="Sale keys position" value="Default" />
    </OutletSettingsScaffold>
  );
}
