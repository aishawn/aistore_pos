import { CompanySettingsScaffold, TextRow } from "@/components/admin/CompanySettingsScaffold";

const HREF = "/settings/company/general-display";

export default function GeneralDisplaySettingsPage() {
  return (
    <CompanySettingsScaffold subSectionTitle="General Display" activeHref={HREF}>
      <TextRow label='"Single" text' value="Item" />
      <TextRow label='"Case" text' value="Case" />
    </CompanySettingsScaffold>
  );
}
