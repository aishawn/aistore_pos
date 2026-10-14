import { ReportBuilder } from "@/components/admin/ReportBuilder";

export default function MiscReportsPage() {
  return (
    <ReportBuilder
      title="Miscellaneous report"
      query={`SELECT BY_NAME AS "Name", value AS "Value", type AS "Type"`}
      panels={[
        { label: "Report Type", value: "Miscellaneous" },
        { label: "Group By", value: "None" },
        { label: "Date and Time", value: "Today" },
        { label: "Consolidate By Report Type", value: "Yes" },
        { label: "Precision", value: "None" },
      ]}
      columns={["Name", "Value", "Type", "Count"]}
    />
  );
}
