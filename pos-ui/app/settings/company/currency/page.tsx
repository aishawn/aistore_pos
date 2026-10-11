import { CompanySettingsScaffold, SelectRow, TextRow } from "@/components/admin/CompanySettingsScaffold";

const HREF = "/settings/company/currency";

export default function CurrencySettingsPage() {
  return (
    <CompanySettingsScaffold subSectionTitle="Currency" activeHref={HREF}>
      <TextRow label="Round to" value="0.05" />
      <SelectRow label="Currency code" value="Australian Dollars (AUD)" />
      <TextRow label="Number locale" value="en-AU" />
    </CompanySettingsScaffold>
  );
}
