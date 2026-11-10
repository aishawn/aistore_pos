"use client";

import { CompanyKvEditor } from "@/components/admin/CompanyKvEditor";
import { sectionByHref } from "@/lib/company-settings-catalog";

export default function MiscellaneousSettingsPage() {
  return <CompanyKvEditor section={sectionByHref("/settings/company/miscellaneous")!} />;
}
