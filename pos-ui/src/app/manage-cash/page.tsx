import { WalletIcon } from "@/components/icons";

const ACTIONS = ["Open Cash Drawer", "Put Cash In", "Take Cash Out", "Safe Drop", "Swap Cash"];

/**
 * Manage Cash — drawer action pills, current drawer stats, and an empty-state
 * for cash movements. Mirrors the live page (empty drawer).
 */
export default function ManageCashPage() {
  return (
    <div className="h-full overflow-auto bg-white font-sans">
      {/* Action pills */}
      <div className="flex flex-wrap gap-3 p-4">
        {ACTIONS.map((a) => (
          <button
            key={a}
            type="button"
            className="rounded-full bg-[#5cb3e0] px-6 py-2.5 text-[16px] font-bold text-white"
          >
            {a}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="flex gap-12 px-4">
        <div>
          <div className="text-[14px] font-bold text-black">Open Time</div>
          <div className="text-[18px] text-black">27/06/2026 12:47:21</div>
        </div>
        <div>
          <div className="text-[14px] font-bold text-black">Received Cash In Drawer</div>
          <div className="text-[18px] text-black">$0.00</div>
        </div>
      </div>

      {/* Empty state */}
      <div className="mt-16 flex items-center justify-center gap-10">
        <WalletIcon size={150} strokeWidth={1.5} className="text-black" />
        <div className="max-w-md">
          <h2 className="text-[28px] font-bold text-black">No Cash Movements</h2>
          <p className="mt-2 text-[18px] text-black">
            You can adjust the cash in the drawer by using the buttons above
          </p>
        </div>
      </div>
    </div>
  );
}
