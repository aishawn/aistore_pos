export function ReportParityNote({ className }: { className?: string } = {}) {
  return (
    <p className={className ?? "text-xs text-[var(--oh-muted)]"}>
      Report basis: completed + incomplete sales. Profit = revenue − cost. Parked carts are excluded. Missing tax or historical cost is shown as unavailable.
    </p>
  );
}
