"use client";

import { CompanyKvEditor } from "@/components/admin/CompanyKvEditor";
import { sectionByHref } from "@/lib/company-settings-catalog";

export default function DateTimeSettingsPage() {
  return <CompanyKvEditor section={sectionByHref("/settings/company/date-time")!} />;
}
