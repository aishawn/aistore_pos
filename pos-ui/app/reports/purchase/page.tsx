import { ReportBuilder } from "@/components/admin/ReportBuilder";

export default function PurchaseReportsPage() {
  return (
    <ReportBuilder
      query={`SELECT BY_NAME AS "Name", quantity_ordered AS "Quantity Ordered", quantity_received AS "Quantity Received", cost AS "Cost"`}
      panels={[
        { label: "Report Type", value: "Supplier" },
        { label: "Group By", value: "None" },
        { label: "Date and Time", value: "Today" },
        { label: "Consolidate By Report Type", value: "Yes" },
        { label: "Precision", value: "None" },
      ]}
      columns={["Name", "Quantity Ordered", "Quantity Received", "Cost", "Outstanding", "Supplier"]}
      totals={[null, "0", "0", "$0.00", "$0.00", null]}
    />
  );
}
