"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "@/hooks/useDialogFocus";

export function StockWorkspaceDialog({ title, busy, onClose, children, actions, variant = "default" }: { title: string; busy: boolean; onClose: () => void; children: ReactNode; actions?: ReactNode; variant?: "default" | "records" }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(true, () => { if (!busy) onClose(); }, undefined, closeRef);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
<section role="dialog" aria-modal="true" aria-label={title} aria-busy={busy} className={`flex h-dvh w-full min-w-0 flex-col bg-[var(--oh-surface-elevated)] shadow-xl sm:rounded-xl ${variant === "records" ? "sm:h-[96dvh] sm:max-h-[calc(100dvh-2rem)] sm:max-w-[1600px]" : "sm:h-auto sm:max-h-[90dvh] sm:max-w-5xl"}`}>
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--oh-border)] p-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="flex flex-wrap gap-2">{actions}<button ref={closeRef} type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50">Close{title === "Stocktake" ? " & keep draft" : ""}</button></div>
        </header>
        <div className={`min-h-0 flex-1 p-4 md:p-5 ${variant === "records" ? "overflow-hidden" : "overflow-y-auto"}`}>{children}</div>
      </section>
    </div>, document.body,
  );
}
