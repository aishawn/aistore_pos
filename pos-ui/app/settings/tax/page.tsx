"use client";

import { SettingsCatalogCrud } from "@/components/admin/SettingsCatalogCrud";
import { StoreSettingsTabs } from "@/components/admin/SetupHubTabs";

export default function TaxRatesPage() {
  return (
    <SettingsCatalogCrud
      title="Tax Rates"
      subtitle="Orithos sales tax catalogue (editable)"
      endpoint="/api/tax-rates"
      columns={[
        { key: "name", label: "Tax" },
        { key: "amount", label: "Rate %", type: "number" },
        { key: "isDefault", label: "Default", type: "boolean" },
      ]}
      createDefaults={{ name: "GST", amount: 10, isDefault: false }}
      toolbar={<StoreSettingsTabs activeHref="/settings/tax" />}
    />
  );
}
