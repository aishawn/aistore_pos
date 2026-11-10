"use client";

import { CompanyKvEditor } from "@/components/admin/CompanyKvEditor";
import { sectionByHref } from "@/lib/company-settings-catalog";

export default function GeneralCompanySettingsPage() {
  const section = sectionByHref("/settings/company/general")!;
  return <CompanyKvEditor section={section} />;
}
