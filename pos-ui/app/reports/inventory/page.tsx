import { ReportBuilder } from "@/components/admin/ReportBuilder";

export default function InventoryReportsPage() {
  return (
    <ReportBuilder
      title="Inventory report"
      query={`SELECT BY_NAME AS "Name", inventory AS "Inventory On Hand", cost AS "Cost Value", retail AS "Retail Value", FORMAT(cost / inventory) AS "Average Cost"`}
      panels={[
        { label: "Report Type", value: "Outlet" },
        { label: "Group By", value: "None" },
        { label: "Date and Time", value: "Today" },
        { label: "Consolidate By Report Type", value: "Yes" },
        { label: "Precision", value: "None" },
      ]}
      columns={["Name", "Inventory On Hand", "Cost Value", "Retail Value", "Average Cost", "Last Cost", "Markup"]}
      totals={[null, "0", "$0.00", "$0.00", "$0.00", "$0.00", "0.00%"]}
    />
  );
}
