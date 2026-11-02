"use client";

import { OdooSalesHistoryPage } from "@/components/OdooSalesHistoryPage";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import type { OdooSalesStatusFilter } from "@/lib/odoo-api";

/** Overlay host for Sales History from POS toolbar / user menu. */
export function OdooSalesHistoryModal({
  open,
  onClose,
  initialStatus = "all",
}: {
  open: boolean;
  onClose: () => void;
  initialStatus?: OdooSalesStatusFilter;
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
        className="flex h-[min(92dvh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white shadow-2xl"
      >
        <OdooSalesHistoryPage key={initialStatus} variant="panel" initialStatus={initialStatus} onRequestClose={onClose} />
      </section>
    </div>
  );
}
