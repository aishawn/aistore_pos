import { redirect } from "next/navigation";

export default function LegacySettingsPage() {
  redirect("/settings/company/general");
}
