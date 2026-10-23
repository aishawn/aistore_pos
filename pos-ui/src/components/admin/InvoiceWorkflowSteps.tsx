"use client";

const STEPS = [
  { id: "capture", label: "Capture" },
  { id: "match", label: "Match" },
  { id: "receive", label: "Receive" },
  { id: "done", label: "Done" },
] as const;

export type InvoiceWorkflowStepId = (typeof STEPS)[number]["id"];

export function invoiceStepFromStatus(status?: string | null): InvoiceWorkflowStepId {
  switch (status) {
    case "received":
      return "done";
    case "po_created":
      return "receive";
    case "matched":
    case "failed":
    case "draft":
      return "match";
    default:
      return "capture";
  }
}

export function InvoiceWorkflowSteps({
  active,
  className = "",
}: {
  active: InvoiceWorkflowStepId;
  className?: string;
}) {
  const activeIndex = STEPS.findIndex((step) => step.id === active);

  return (
    <ol
      aria-label="Invoice workflow steps"
      className={`flex flex-wrap items-center gap-2 text-xs font-semibold ${className}`}
    >
      {STEPS.map((step, index) => {
        const done = index < activeIndex;
        const current = index === activeIndex;
        return (
          <li key={step.id} className="flex items-center gap-2">
            {index > 0 && (
              <span aria-hidden="true" className={`h-px w-4 sm:w-6 ${done || current ? "bg-[var(--oh-primary)]" : "bg-[var(--oh-border)]"}`} />
            )}
            <span
              className={[
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
                current
                  ? "bg-[var(--oh-primary)] text-white"
                  : done
                    ? "bg-emerald-50 text-emerald-900"
                    : "bg-[var(--oh-surface)] text-[var(--oh-muted)]",
              ].join(" ")}
            >
              <span className="tabular-nums">{index + 1}</span>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
