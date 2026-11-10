"use client";

import { CompanyKvEditor } from "@/components/admin/CompanyKvEditor";
import { sectionByHref } from "@/lib/company-settings-catalog";

export default function LoginSettingsPage() {
  return <CompanyKvEditor section={sectionByHref("/settings/company/login-after-sale")!} />;
}
