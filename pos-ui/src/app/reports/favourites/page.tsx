export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { SelectChevronIcon } from "@/components/icons";

export default function FavouriteReportsPage() {
  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <h1 className="text-[34px] font-bold text-black">Favourite Reports</h1>

      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
        <label className="flex flex-col text-[16px] text-black">Report Name
          <input placeholder="Search Report Name..." className="mt-1 h-[52px] rounded-lg border border-neutral-300 px-3 outline-none placeholder:text-neutral-400" />
        </label>
        <label className="flex flex-col text-[16px] text-black">Report Type
          <span className="mt-1 flex h-[52px] items-center justify-between rounded-lg border border-neutral-300 px-3 text-neutral-400">Filter Report Types... <SelectChevronIcon size={18} /></span>
        </label>
        <label className="flex flex-col text-[16px] text-black">Email Filter
          <span className="mt-1 flex h-[52px] items-center justify-between rounded-lg border border-neutral-300 px-3 text-neutral-400">Filter Report Emailing... <SelectChevronIcon size={18} /></span>
        </label>
      </div>

      <p className="mt-16 text-center text-[20px] text-neutral-500">No reports found.</p>
    </div>
  );
}
