import {
  AdminPageLayout,
  AdminPrimaryButton,
} from "@/components/admin/AdminPageLayout";
import { CircleCheckIcon, CalculatorIcon, QuestionIcon, ChevronRightIcon } from "@/components/icons";

const DENOMINATIONS = [
  "$0.05", "$0.10", "$0.20", "$0.50", "$1.00", "$2.00",
  "$5.00", "$10.00", "$20.00", "$50.00", "$100.00",
];

export default function CloseRegisterPage() {
  return (
    <AdminPageLayout title="Close Register" subtitle="Reconcile payments and count cash" fullBleed>
      <div className="flex min-h-[calc(100vh-12rem)] rounded-lg border border-[var(--oh-border)] bg-white">
        {/* Left column */}
        <div className="relative flex w-1/2 flex-col border-r border-[var(--oh-border)] p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)]">
              <CalculatorIcon size={18} strokeWidth={1.5} className="text-[var(--oh-text)]" />
            </span>
            <h2 className="text-[18px] font-semibold text-[var(--oh-text)]">Payment Reconciliation</h2>
          </div>

          <div className="mt-4 flex gap-10">
            <div>
              <div className="text-[12px] font-medium text-[var(--oh-muted)]">Open Time</div>
              <div className="text-[15px] text-[var(--oh-text)]">2 days ago</div>
            </div>
            <div>
              <div className="text-[12px] font-medium text-[var(--oh-muted)]">Sale Upload Status</div>
              <div className="flex items-center gap-2 text-[15px] text-[var(--oh-text)]">
                All Uploaded <CircleCheckIcon size={16} className="text-[var(--oh-success)]" />
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center rounded-lg bg-[var(--oh-primary)] px-5 py-3 text-[13px] font-semibold text-white">
            <span className="flex-1">Payment Method</span>
            <span className="flex flex-1 items-center justify-center gap-1">
              Expected <QuestionIcon size={14} />
            </span>
            <span className="flex flex-1 items-center justify-center gap-1">
              Received <QuestionIcon size={14} />
            </span>
            <span className="flex-1 text-center">Difference</span>
          </div>

          <button type="button" className="mt-4 flex items-center gap-2 text-[14px] text-[var(--oh-text-secondary)]">
            <ChevronRightIcon size={16} /> Show 6 more payment methods
          </button>

          <div className="mt-6">
            <label className="text-[13px] font-medium text-[var(--oh-text-secondary)]">Register Closure Note</label>
            <textarea
              rows={4}
              className="mt-1.5 w-full resize-none rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3 text-[14px] outline-none focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]"
            />
          </div>

          <div className="mt-auto pt-6">
            <AdminPrimaryButton>Close Register</AdminPrimaryButton>
          </div>
        </div>

        {/* Right column */}
        <div className="flex w-1/2 flex-col overflow-auto p-6">
          <div className="flex items-center rounded-lg bg-[var(--oh-primary)] px-5 py-3 text-[13px] font-semibold text-white">
            <span className="flex-1">Denomination</span>
            <span className="flex-1 text-center">Amount</span>
            <span className="flex-1 text-center">Value</span>
          </div>

          {DENOMINATIONS.map((d, i) => (
            <div
              key={d}
              className={`flex items-center px-5 py-2 ${i % 2 === 1 ? "bg-[var(--oh-surface)]" : "bg-white"}`}
            >
              <span className="flex-1 text-[14px] text-[var(--oh-text)]">{d}</span>
              <span className="flex flex-1 justify-center">
                <input className="h-9 w-[130px] rounded-lg border border-[var(--oh-border)] px-3 text-[14px] outline-none focus:border-[var(--oh-orange)]" />
              </span>
              <span className="flex flex-1 justify-center">
                <span className="flex h-9 w-[130px] items-center rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[var(--oh-placeholder)]">$</span>
              </span>
            </div>
          ))}

          <div className="mt-4 flex items-center border-t border-[var(--oh-border)] px-5 py-3">
            <span className="flex-1 text-[15px] font-medium text-[var(--oh-text)]">In Drawer</span>
            <span className="flex-1 text-center text-[15px] font-semibold text-[var(--oh-text)]">$0.00</span>
            <span className="flex-1" />
          </div>
          <div className="flex items-center px-5 py-2">
            <span className="flex flex-1 items-center gap-2 text-[15px] text-[var(--oh-text)]">
              Float <QuestionIcon size={14} className="text-[var(--oh-muted)]" />
            </span>
            <span className="flex-1" />
            <span className="flex flex-1 justify-center">
              <span className="flex h-9 w-[130px] items-center rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[var(--oh-placeholder)]">$</span>
            </span>
          </div>
          <div className="flex items-center border-t border-[var(--oh-border)] px-5 py-3">
            <span className="flex-1 text-[15px] font-medium text-[var(--oh-text)]">Total</span>
            <span className="flex-1 text-center text-[15px] font-semibold text-[var(--oh-text)] line-through">$0.00</span>
            <span className="flex-1" />
          </div>
        </div>
      </div>
    </AdminPageLayout>
  );
}
