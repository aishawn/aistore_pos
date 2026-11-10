"use client";

import { CompanyKvEditor } from "@/components/admin/CompanyKvEditor";
import { sectionByHref } from "@/lib/company-settings-catalog";

export default function SellScreenSettingsPage() {
  return <CompanyKvEditor section={sectionByHref("/settings/company/sell-screen")!} />;
}
