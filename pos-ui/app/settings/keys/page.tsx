"use client";

import { SettingsCatalogCrud } from "@/components/admin/SettingsCatalogCrud";

export default function SaleKeysSettingsPage() {
  return (
    <SettingsCatalogCrud
      title="Sale Keys"
      subtitle="Quick-access sale key layouts for the register"
      endpoint="/api/sale-keys"
      columns={[
        { key: "name", label: "Name" },
        { key: "saleKeys", label: "Layout JSON" },
      ]}
      createDefaults={{ name: "Default keys", saleKeys: "[]" }}
    />
  );
}
