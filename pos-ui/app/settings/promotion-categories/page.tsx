"use client";

import { SettingsCatalogCrud } from "@/components/admin/SettingsCatalogCrud";

export default function PromotionCategoriesPage() {
  return (
    <SettingsCatalogCrud
      title="Promotion Categories"
      subtitle="Categories used to organise promotions"
      endpoint="/api/promotion-categories"
      columns={[
        { key: "name", label: "Name" },
        { key: "showOnOrder", label: "Show on order", type: "boolean" },
        { key: "includeInIntegrations", label: "Integrations", type: "boolean" },
      ]}
      createDefaults={{ name: "General", showOnOrder: true, includeInIntegrations: true }}
    />
  );
}
