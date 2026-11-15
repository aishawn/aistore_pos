export function ReportParityNote({ className }: { className?: string } = {}) {
  const text =
    "Report basis: completed + incomplete sales. Profit = revenue − cost. Parked carts are excluded. Missing tax or historical cost is shown as unavailable.";

  return (
    <details className={className ?? "group text-xs text-[var(--oh-muted)]"}>
      <summary className="cursor-pointer list-none font-medium text-[var(--oh-text-secondary)] marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="underline decoration-[var(--oh-border)] underline-offset-2 group-open:no-underline">
          Reporting basis
        </span>
      </summary>
      <p className="mt-2 leading-relaxed">{text}</p>
    </details>
  );
}