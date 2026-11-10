"use client";

import { CompanyKvEditor } from "@/components/admin/CompanyKvEditor";
import { sectionByHref } from "@/lib/company-settings-catalog";

export default function SearchSettingsPage() {
  return <CompanyKvEditor section={sectionByHref("/settings/company/search")!} />;
}
