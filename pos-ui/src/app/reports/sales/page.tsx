import { ReportBuilder } from "@/components/admin/ReportBuilder";

const PANELS = [
  { label: "Report Type", value: "Outlet" },
  { label: "Group By", value: "None" },
  { label: "Date and Time", value: "Today" },
  { label: "Consolidate By Report Type", value: "Yes" },
  { label: "Precision", value: "None" },
];

export default function SalesReportsPage() {
  return (
    <ReportBuilder
      title="Sales report"
      query={`SELECT BY_NAME AS "Name", revenue AS "Revenue", cost AS "Cost of Goods Sold", transaction_count AS "Transaction Count", FORMAT(revenue / transaction_count) AS "Average Sale"`}
      panels={PANELS}
      columns={["Name", "Revenue", "Cost of Goods Sold", "Transaction Count", "Average Sale", "Profit", "Profit Percentage", "Tax Amount", "Discount Amount"]}
      totals={[null, "$0.00", "$0.00", null, "$0.00", "$0.00", "0.00%", "$0.00", "$0.00"]}
    />
  );
}
