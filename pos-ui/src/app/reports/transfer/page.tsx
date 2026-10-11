import { ReportBuilder } from "@/components/admin/ReportBuilder";

export default function TransferReportsPage() {
  return (
    <ReportBuilder
      query={`SELECT BY_NAME AS "Name", from_outlet AS "From", to_outlet AS "To", quantity AS "Quantity", cost AS "Cost Value"`}
      panels={[
        { label: "Report Type", value: "Outlet" },
        { label: "Group By", value: "None" },
        { label: "Date and Time", value: "Today" },
        { label: "Consolidate By Report Type", value: "Yes" },
        { label: "Precision", value: "None" },
      ]}
      columns={["Name", "From", "To", "Quantity", "Cost Value", "Retail Value"]}
      totals={[null, null, null, "0", "$0.00", "$0.00"]}
    />
  );
}
