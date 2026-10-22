import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Former Reporting Dashboard — merged into Overview. */
export default function ReportingDashboardPage() {
  redirect("/overview");
}
