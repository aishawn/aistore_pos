import { RegisterSettingsScaffold, SelectRow } from "@/components/admin/RegisterSettingsScaffold";

const HREF = "/settings/registers/miscellaneous";

export default function RegisterMiscellaneousSettingsPage() {
  return (
    <RegisterSettingsScaffold subSectionTitle="Miscellaneous" activeHref={HREF}>
      <SelectRow
        label="Sale Keys"
        value="Default"
        description="The sale keys to override the Outlet's sale keys, can be overridden by the User settings"
      />
      <SelectRow
        label="Sale Keys Position"
        value="Default"
        description="Show sale keys on the left-hand side or right-hand side of the sell screen"
      />
    </RegisterSettingsScaffold>
  );
}
