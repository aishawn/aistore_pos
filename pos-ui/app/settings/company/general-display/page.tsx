"use client";

import { CompanyKvEditor } from "@/components/admin/CompanyKvEditor";
import { sectionByHref } from "@/lib/company-settings-catalog";

export default function GeneralDisplaySettingsPage() {
  return <CompanyKvEditor section={sectionByHref("/settings/company/general-display")!} />;
}
