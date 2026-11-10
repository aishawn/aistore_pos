import { NativeReportsDashboardPage } from "@/components/NativeReportsDashboardPage";

export const dynamic = "force-dynamic";

/**
 * Reports dashboard uses Orithos ledger APIs.
 * ShopfrontReportsOverviewPage depended on /api/shopfront-source which is retired (410).
 */
export default function ReportingDashboardPage() {
  return <NativeReportsDashboardPage />;
}
