import { CompanySettingsScaffold, SelectRow } from "@/components/admin/CompanySettingsScaffold";

const HREF = "/settings/company/date-time";

export default function DateTimeSettingsPage() {
  return (
    <CompanySettingsScaffold subSectionTitle="Date & Time" activeHref={HREF}>
      <SelectRow label="Timezone" value="Australia/Sydney (AEST/AEDT)" />
      <SelectRow label="Date format" value="DD/MM/YYYY" />
      <SelectRow label="Time format" value="HH:mm:ss" />
      <SelectRow label="Start of the week" value="Monday" />
    </CompanySettingsScaffold>
  );
}
