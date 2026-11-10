"use client";

import { NativeSalesHistoryPage } from "@/components/NativeSalesHistoryPage";
import { useDialogFocus } from "@/hooks/useDialogFocus";

/** Overlay host for Sales History from POS toolbar / user menu (Orithos ledger). */
export function NativeSalesHistoryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useDialogFocus(open, onClose);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-2 sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Sales History"
        className="flex h-[96dvh] max-h-[calc(100dvh-1rem)] w-full max-w-[1600px] flex-col overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
      >
        <NativeSalesHistoryPage variant="panel" onRequestClose={onClose} />
      </section>
    </div>
  );
}
