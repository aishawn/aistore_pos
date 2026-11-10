"use client";

import { SettingsCatalogCrud } from "@/components/admin/SettingsCatalogCrud";

export default function BarcodeTemplatesPage() {
  return (
    <SettingsCatalogCrud
      title="Barcode Templates"
      subtitle="Label and barcode templates stored in Orithos"
      endpoint="/api/barcode-templates"
      columns={[
        { key: "name", label: "Name" },
        { key: "template", label: "Template" },
        { key: "recalculateQuantity", label: "Recalculate qty", type: "boolean" },
      ]}
      createDefaults={{ name: "Shelf label", template: "", recalculateQuantity: false }}
    />
  );
}
