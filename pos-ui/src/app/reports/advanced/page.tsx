import { ReportBuilder } from "@/components/admin/ReportBuilder";

export default function AdvancedReportsPage() {
  return (
    <ReportBuilder
      title="Advanced report"
      query={`SELECT BY_NAME AS "Name", SUM(revenue) AS "Revenue", SUM(profit) AS "Profit", FORMAT(profit / revenue * 100) AS "Margin"`}
      panels={[
        { label: "Report Type", value: "Custom" },
        { label: "Group By", value: "None" },
        { label: "Date and Time", value: "Today" },
        { label: "Consolidate By Report Type", value: "Yes" },
        { label: "Precision", value: "None" },
      ]}
      columns={["Name", "Revenue", "Profit", "Margin", "Transaction Count"]}
    />
  );
}
