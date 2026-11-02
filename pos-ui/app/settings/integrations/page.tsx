import { redirect } from "next/navigation";

export default function IntegrationsPage() {
  redirect("/settings/account?tab=connection");
}
