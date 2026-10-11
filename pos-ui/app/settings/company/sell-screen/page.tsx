import { CompanySettingsScaffold, ToggleRow } from "@/components/admin/CompanySettingsScaffold";

const HREF = "/settings/company/sell-screen";

export default function SellScreenSettingsPage() {
  return (
    <CompanySettingsScaffold subSectionTitle="Sell Screen / Register" activeHref={HREF}>
      <ToggleRow label="Show product details when a product is added" />
      <ToggleRow label="Display customer details when a customer is added" />
      <ToggleRow label="Prevent blur on focus loss on sell screen" />
      <ToggleRow label="Keep select product popup open" />
      <ToggleRow label="Make select product popup paginated by default" />
      <ToggleRow label="Discounts require reason" />
    </CompanySettingsScaffold>
  );
}
