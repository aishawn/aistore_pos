import { Segmented } from "@/components/admin/Segmented";
import { CartIcon, LineChartIcon, PieChartIcon } from "@/components/icons";

function ChartCard({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[28px] text-neutral-800">
          {title} <span className="text-[18px] text-neutral-400">(?)</span>
        </h3>
        <div className="flex overflow-hidden rounded-md">
          <span className="bg-[#3aa0e3] px-3 py-2 text-white"><LineChartIcon size={18} /></span>
          <span className="bg-[#3a3d42] px-3 py-2 text-white"><PieChartIcon size={18} /></span>
        </div>
      </div>
      <div className="mt-2 flex justify-between bg-[#eef3f1] px-3 py-2 text-[18px] text-neutral-700">
        <span>11</span>
        <span>{value}</span>
      </div>
      <svg viewBox="0 0 300 160" className="mt-2 w-full">
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="0" x2="300" y1={i * 32} y2={i * 32} stroke="#eee" />
        ))}
        <path d="M0,150 C60,150 80,30 110,30 C140,30 150,150 300,150" fill="#cfe3da" opacity={0.5} />
        <path d="M0,150 C60,150 80,30 110,30 C140,30 150,150 300,150" fill="none" stroke="#7bb6a3" strokeWidth={2} />
      </svg>
    </div>
  );
}

export default function ReportingDashboardPage() {
  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <div className="flex flex-wrap justify-around gap-8">
        <Segmented label="Timeline Value" options={["Sale Count", "Revenue"]} active={0} />
        <Segmented label="Time Period" options={["Day", "Week", "Month", "Year"]} active={0} />
        <Segmented label="Compare With" options={["None", "Last Week", "Last Month", "Last Year"]} active={0} />
      </div>

      <div className="my-12 flex items-center justify-center gap-10">
        <CartIcon size={150} strokeWidth={1.5} className="text-black" />
        <div>
          <h2 className="text-[28px] font-bold text-black">No Sales Data</h2>
          <p className="mt-2 text-[18px] text-black">You haven&apos;t completed any sales in the last eight hours.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
        <ChartCard title="Revenue" value="$0.00" />
        <ChartCard title="Sale Count" value="0" />
        <ChartCard title="Customer Count" value="0" />
      </div>
    </div>
  );
}
