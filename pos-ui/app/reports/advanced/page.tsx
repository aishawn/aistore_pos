import { OdooReportUnavailablePage } from "@/components/admin/OdooReportUnavailablePage";

export default function AdvancedReportsPage() {
  return (
    <OdooReportUnavailablePage
      title="Custom reports"
      description="Custom SQL-style reports are not available yet. The live overview, inventory, purchasing, transfers, and sales history pages already read the Orithos ledger."
    />
  );
}
