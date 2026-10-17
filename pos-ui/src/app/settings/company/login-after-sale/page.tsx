export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { CompanySettingsScaffold, NumberRow, SelectRow, ToggleRow } from "@/components/admin/CompanySettingsScaffold";

const HREF = "/settings/company/login-after-sale";

export default function LoginAfterSaleSettingsPage() {
  return (
    <CompanySettingsScaffold subSectionTitle="Login After Sale" activeHref={HREF}>
      <SelectRow label="Log in type" value="Select user" />
      <ToggleRow label="Mask username" />
      <ToggleRow label="Require password" on />
      <NumberRow label="General auto logout time (seconds)" value={7200} />
      <NumberRow label="Sell screen auto logout time (seconds)" value={0} />
      <ToggleRow label="Auto logout during sale" />
    </CompanySettingsScaffold>
  );
}
