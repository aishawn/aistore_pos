"use client";

import { SettingsCatalogCrud } from "@/components/admin/SettingsCatalogCrud";
import { DevicesSettingsTabs } from "@/components/admin/SetupHubTabs";

export default function ReceiptsSettingsPage() {
  return (
    <SettingsCatalogCrud
      title="Receipts"
      subtitle="Receipt templates stored in Orithos"
      endpoint="/api/receipts"
      columns={[
        { key: "name", label: "Name" },
        { key: "type", label: "Type" },
        { key: "receiptWidth", label: "Width", type: "number" },
        { key: "accountReceipt", label: "Account receipt", type: "boolean" },
      ]}
      createDefaults={{ name: "Default receipt", type: "SALE", receiptWidth: 80, accountReceipt: false, components: "[]" }}
      toolbar={<DevicesSettingsTabs activeHref="/settings/receipts" />}
    />
  );
}
