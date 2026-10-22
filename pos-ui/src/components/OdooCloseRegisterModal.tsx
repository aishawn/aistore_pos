"use client";

import { useCallback, useState } from "react";
import { OdooCloseRegisterForm } from "@/components/OdooCloseRegisterForm";
import { useDialogFocus } from "@/hooks/useDialogFocus";

/** Overlay host for close-register from POS / admin menu. */
export function OdooCloseRegisterModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const requestClose = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  useDialogFocus(open, requestClose);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-3 sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Close register"
        className="flex max-h-[min(90dvh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white shadow-2xl"
      >
        <OdooCloseRegisterForm
          variant="modal"
          active={open}
          onBusyChange={setBusy}
          onRequestClose={requestClose}
        />
      </section>
    </div>
  );
}
