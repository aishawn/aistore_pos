import { ReportBuilder } from "@/components/admin/ReportBuilder";

export default function ActionsReportsPage() {
  return (
    <ReportBuilder
      title="Actions report"
      query={`SELECT action AS "Action", user AS "User", COUNT(*) AS "Count", outlet AS "Outlet"`}
      panels={[
        { label: "Report Type", value: "User" },
        { label: "Group By", value: "Action" },
        { label: "Date and Time", value: "Today" },
        { label: "Consolidate By Report Type", value: "Yes" },
        { label: "Precision", value: "None" },
      ]}
      columns={["Action", "User", "Count", "Outlet", "Register"]}
    />
  );
}
