"use client";

import { SettingsCatalogCrud } from "@/components/admin/SettingsCatalogCrud";

export default function TransferListSettingsPage() {
  return (
    <SettingsCatalogCrud
      title="Transfer List"
      subtitle="Stock transfer destinations (transferees)"
      endpoint="/api/transferees"
      columns={[
        { key: "name", label: "Name" },
        { key: "emailFormat", label: "Email format" },
        { key: "orderAutomaticEmail", label: "Auto email", type: "boolean" },
      ]}
      createDefaults={{ name: "New transferee", orderAutomaticEmail: false, sendOrdersToAccountsFlow: false }}
    />
  );
}
