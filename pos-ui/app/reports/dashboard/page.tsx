import { Segmented } from "@/components/admin/Segmented";
import {
  AdminPageLayout,
  AdminEmptyHero,
  AdminStatCard,
} from "@/components/admin/AdminPageLayout";
import { CartIcon, LineChartIcon, PieChartIcon } from "@/components/icons";

function ChartToggle() {
  return (
    <div className="flex overflow-hidden rounded-lg border border-[var(--oh-border)]">
      <span className="bg-[var(--oh-orange)] px-2.5 py-1.5 text-white"><LineChartIcon size={16} /></span>
      <span className="bg-[var(--oh-primary)] px-2.5 py-1.5 text-white"><PieChartIcon size={16} /></span>
    </div>
  );
}

export default function ReportingDashboardPage() {
  return (
    <AdminPageLayout title="Reporting Dashboard" subtitle="Sales performance and trends">
      <div className="mb-8 flex flex-wrap justify-around gap-6">
        <Segmented label="Timeline Value" options={["Sale Count", "Revenue"]} active={0} />
        <Segmented label="Time Period" options={["Day", "Week", "Month", "Year"]} active={0} />
        <Segmented label="Compare With" options={["None", "Last Week", "Last Month", "Last Year"]} active={0} />
      </div>

      <AdminEmptyHero
        icon={<CartIcon size={80} strokeWidth={1.5} />}
        title="No Sales Data"
        description="You haven't completed any sales in the last eight hours."
      />

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {[
          { title: "Revenue", value: "$0.00" },
          { title: "Sale Count", value: "0" },
          { title: "Customer Count", value: "0" },
        ].map(({ title, value }) => (
          <AdminStatCard key={title} title={title} value={value}>
            <ChartToggle />
          </AdminStatCard>
        ))}
      </div>
    </AdminPageLayout>
  );
}
