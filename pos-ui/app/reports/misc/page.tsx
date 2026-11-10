import { OdooReportUnavailablePage } from "@/components/admin/OdooReportUnavailablePage";

export default function MiscReportsPage() {
  return (
    <OdooReportUnavailablePage
      title="Miscellaneous reports"
      description="Miscellaneous report views are not wired to Orithos ledger APIs yet. Use the live overview, sales, inventory, and purchasing pages until this surface has a native source."
    />
  );
}
