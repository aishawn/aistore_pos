"use client";

import { useId } from "react";
import { XIcon } from "@/components/icons";
import { useDialogFocus } from "@/hooks/useDialogFocus";

/** Centered modal dialog with an overlay. */
export function Modal({
  title,
  onClose,
  children,
  footer,
  closeOnOverlayClick = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnOverlayClick?: boolean;
}) {
  const titleId = useId();
  useDialogFocus(true, onClose);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4 font-sans"
      onClick={() => {
        if (closeOnOverlayClick) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-[520px] flex-col overflow-hidden rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--oh-border)] px-4 py-3 sm:items-center sm:px-6 sm:py-4">
          <h2 id={titleId} className="min-w-0 break-words pt-2 text-lg font-bold text-[var(--oh-text)] sm:pt-0 sm:text-[22px]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
            <XIcon size={22} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-neutral-200 px-4 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}
