import { CircleCheckIcon, CalculatorIcon, QuestionIcon, ChevronRightIcon } from "@/components/icons";

const DENOMINATIONS = [
  "$0.05", "$0.10", "$0.20", "$0.50", "$1.00", "$2.00",
  "$5.00", "$10.00", "$20.00", "$50.00", "$100.00",
];

/**
 * Close Register — left: payment-method reconciliation + closure note + submit;
 * right: cash denomination counter with In Drawer / Float / Total summary.
 */
export default function CloseRegisterPage() {
  return (
    <div className="flex h-full bg-white font-sans">
      {/* Left column */}
      <div className="relative flex w-1/2 flex-col border-r border-[#e0e0e0] p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-300">
            <CalculatorIcon size={20} strokeWidth={1.5} className="text-black" />
          </span>
          <h1 className="text-[32px] font-bold text-black">Close Register</h1>
        </div>

        <div className="mt-4 flex gap-12">
          <div>
            <div className="text-[14px] text-neutral-500">Open Time</div>
            <div className="text-[18px] text-black">2 days ago</div>
          </div>
          <div>
            <div className="text-[14px] text-neutral-500">Sale Upload Status</div>
            <div className="flex items-center gap-2 text-[18px] text-black">
              All Uploaded <CircleCheckIcon size={18} className="text-[#3cb44b]" />
            </div>
          </div>
        </div>

        {/* Payment method header */}
        <div className="mt-6 flex items-center rounded-full bg-[#5cb3e0] px-6 py-3 text-[16px] font-bold text-white">
          <span className="flex-1">Payment Method</span>
          <span className="flex flex-1 items-center justify-center gap-1">
            Expected <QuestionIcon size={16} />
          </span>
          <span className="flex flex-1 items-center justify-center gap-1">
            Received <QuestionIcon size={16} />
          </span>
          <span className="flex-1 text-center">Difference</span>
        </div>

        <button type="button" className="mt-4 flex items-center gap-2 text-[16px] text-black">
          <ChevronRightIcon size={18} /> Show 6 more payment methods
        </button>

        <div className="mt-6">
          <label className="text-[14px] text-neutral-600">Register Closure Note</label>
          <textarea
            rows={4}
            className="mt-1 w-full resize-none rounded border border-[#bdbdbd] p-2 text-[16px] outline-none"
          />
        </div>

        <button
          type="button"
          className="absolute bottom-6 left-6 rounded-full bg-[#5cb3e0] px-8 py-3 text-[16px] font-bold text-white"
        >
          Close Register
        </button>
      </div>

      {/* Right column: denomination counter */}
      <div className="flex w-1/2 flex-col overflow-auto p-6">
        <div className="flex items-center rounded-md bg-[#5cb3e0] px-6 py-3 text-[16px] font-bold text-white">
          <span className="flex-1">Denomination</span>
          <span className="flex-1 text-center">Amount</span>
          <span className="flex-1 text-center">Value</span>
        </div>

        {DENOMINATIONS.map((d, i) => (
          <div
            key={d}
            className={`flex items-center px-6 py-2 ${i % 2 === 1 ? "bg-[#f3f3f3]" : "bg-white"}`}
          >
            <span className="flex-1 text-[16px] text-black">{d}</span>
            <span className="flex flex-1 justify-center">
              <input className="h-[42px] w-[150px] rounded border border-neutral-300 px-3 outline-none" />
            </span>
            <span className="flex flex-1 justify-center">
              <span className="flex h-[42px] w-[150px] items-center rounded border border-neutral-300 px-3 text-neutral-400">
                $
              </span>
            </span>
          </div>
        ))}

        <div className="mt-4 flex items-center border-t border-neutral-200 px-6 py-3">
          <span className="flex-1 text-[18px] text-black">In Drawer</span>
          <span className="flex-1 text-center text-[18px] text-black">$0.00</span>
          <span className="flex-1" />
        </div>
        <div className="flex items-center px-6 py-2">
          <span className="flex flex-1 items-center gap-2 text-[18px] text-black">
            Float <QuestionIcon size={16} />
          </span>
          <span className="flex-1" />
          <span className="flex flex-1 justify-center">
            <span className="flex h-[42px] w-[150px] items-center rounded border border-neutral-300 px-3 text-neutral-400">
              $
            </span>
          </span>
        </div>
        <div className="flex items-center border-t border-neutral-200 px-6 py-3">
          <span className="flex-1 text-[18px] text-black">Total</span>
          <span className="flex-1 text-center text-[18px] text-black line-through">$0.00</span>
          <span className="flex-1" />
        </div>
      </div>
    </div>
  );
}
