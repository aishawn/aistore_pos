"use client";

import { SettingsCatalogCrud } from "@/components/admin/SettingsCatalogCrud";

export default function CustomerDisplaySettingsPage() {
  return (
    <SettingsCatalogCrud
      title="Customer Display"
      subtitle="Customer-facing display configurations"
      endpoint="/api/customer-displays"
      columns={[
        { key: "name", label: "Name" },
        { key: "mainColour", label: "Main colour" },
        { key: "textColour", label: "Text colour" },
      ]}
      createDefaults={{ name: "Front counter", mainColour: "#0f172a", textColour: "#ffffff" }}
    />
  );
}
