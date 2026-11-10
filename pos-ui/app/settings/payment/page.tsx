"use client";

import { SettingsCatalogCrud } from "@/components/admin/SettingsCatalogCrud";
import { StoreSettingsTabs } from "@/components/admin/SetupHubTabs";

export default function PaymentMethodsPage() {
  return (
    <SettingsCatalogCrud
      title="Payment Methods"
      subtitle="Orithos payment methods for registers and checkout"
      endpoint="/api/payment-methods"
      columns={[
        { key: "name", label: "Name" },
        { key: "type", label: "Type" },
        { key: "surcharge", label: "Surcharge", type: "number" },
        { key: "useRounding", label: "Use rounding", type: "boolean" },
      ]}
      createDefaults={{ name: "Cash", type: "CASH", surcharge: 0, useRounding: true }}
      toolbar={<StoreSettingsTabs activeHref="/settings/payment" />}
    />
  );
}
