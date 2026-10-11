import { ShieldCheckIcon, SelectChevronIcon } from "@/components/icons";

export default function SecurityCentrePage() {
  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <div className="flex items-center justify-between">
        <h1 className="text-[34px] font-bold text-black">Security Centre</h1>
        <span className="flex h-[46px] items-center rounded border border-neutral-300 px-4 text-[16px] text-black">
          29/06/2026 00:00:00&nbsp;&nbsp;—&nbsp;&nbsp;29/06/2026 23:59:59
        </span>
      </div>

      {/* Pie panel */}
      <div className="mt-4 flex items-center justify-center gap-16 rounded-lg bg-[#f4f4f4] py-10">
        <div className="flex flex-col gap-2 text-[16px]">
          <span className="flex items-center gap-2"><span className="h-4 w-4 bg-[#3aa0e3]" /> Login</span>
          <span className="flex items-center gap-2"><span className="h-4 w-4 bg-[#ef476f]" /> Location Change</span>
        </div>
        <svg width="240" height="240" viewBox="0 0 32 32" className="-rotate-90">
          <circle r="16" cx="16" cy="16" fill="#3aa0e3" />
          <path d="M16 16 L16 0 A16 16 0 0 0 4 22 Z" fill="#ef476f" />
        </svg>
        <div className="text-[16px]">
          <div className="font-bold text-black">Raw Events</div>
          <div className="mb-3 text-black">9</div>
          <div className="font-bold text-black">Patterns Detected</div>
          <div className="text-black">0</div>
        </div>
      </div>

      {/* Shield empty */}
      <div className="my-10 flex items-center justify-center gap-10">
        <ShieldCheckIcon size={150} strokeWidth={1.5} className="text-black" />
        <div>
          <h2 className="text-[28px] font-bold text-black">No Patterns Found</h2>
          <p className="mt-2 text-[18px] text-black">No abnormal patterns detected!</p>
        </div>
      </div>

      {/* Events */}
      <div className="flex items-end justify-between">
        <h2 className="text-[22px] font-bold text-black">Events</h2>
        <label className="flex flex-col text-[14px] text-neutral-600">Filters
          <span className="mt-1 flex h-[46px] w-[300px] items-center justify-between rounded-lg border border-neutral-300 px-3 text-neutral-400">Select... <SelectChevronIcon size={18} /></span>
        </label>
      </div>
      <div className="mt-3 flex bg-[#5cb3e0] font-bold text-white">
        {["Timestamp", "Event", "User", "Outlet", "Register", "Device"].map((c) => (
          <div key={c} className="flex-1 px-4 py-4 text-center">{c}</div>
        ))}
      </div>
    </div>
  );
}
