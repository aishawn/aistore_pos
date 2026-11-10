"use client";

import { SettingsCatalogCrud } from "@/components/admin/SettingsCatalogCrud";

export default function StatementsSettingsPage() {
  return (
    <SettingsCatalogCrud
      title="Statements"
      subtitle="Customer statement templates stored in Orithos"
      endpoint="/api/statements"
      columns={[
        { key: "name", label: "Name" },
        { key: "subject", label: "Subject" },
        { key: "replyTo", label: "Reply-To" },
      ]}
      createDefaults={{ name: "Default statement", subject: "Your statement", replyTo: "" }}
    />
  );
}
