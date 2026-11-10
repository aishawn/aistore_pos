"use client";

import { SettingsCatalogCrud } from "@/components/admin/SettingsCatalogCrud";

export default function PriceSetsPage() {
  return (
    <SettingsCatalogCrud
      title="Price Sets"
      subtitle="Orithos price sets (native, not Odoo pricelists)"
      endpoint="/api/price-sets"
      columns={[
        { key: "name", label: "Name" },
        { key: "parentId", label: "Parent ID", type: "number" },
      ]}
      createDefaults={{ name: "Retail" }}
    />
  );
}
