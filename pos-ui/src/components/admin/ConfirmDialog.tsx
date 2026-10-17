"use client";

import { useEffect } from "react";
import { DeleteIcon, QuestionIcon } from "@/components/icons";

type ConfirmVariant = "danger" | "default";

const VARIANT_STYLES: Record<
  ConfirmVariant,
  { headerBg: string; headerText: string; confirmBg: string; confirmHover: string; Icon: typeof DeleteIcon }
> = {
  danger: {
    headerBg: "bg-[#fdecea]",
    headerText: "text-[#c62828]",
    confirmBg: "bg-[#e2231a]",
    confirmHover: "hover:bg-[#c91c14]",
    Icon: DeleteIcon,
  },
  default: {
    headerBg: "bg-[var(--oh-tile-blue-bg)]",
    headerText: "text-[var(--oh-tile-blue-text)]",
    confirmBg: "bg-[#00a3ee]",
    confirmHover: "hover:bg-[#0090d4]",
    Icon: QuestionIcon,
  },
};

/** Centered confirmation dialog to replace native browser confirm(). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  busy = false,
  busyLabel = variant === "danger" ? "Deleting…" : "Working…",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open || busy) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel, open]);

  if (!open) return null;

  const styles = VARIANT_STYLES[variant];
  const HeaderIcon = styles.Icon;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4 font-sans backdrop-blur-[2px]"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="flex w-full max-w-[420px] flex-col overflow-hidden rounded-[var(--oh-radius)] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center gap-2.5 px-5 py-4 ${styles.headerBg}`}>
          <HeaderIcon size={20} className={`shrink-0 ${styles.headerText}`} strokeWidth={2} />
          <h2 id="confirm-dialog-title" className={`text-[16px] font-semibold ${styles.headerText}`}>
            {title}
          </h2>
        </div>

        <p id="confirm-dialog-message" className="px-5 py-5 text-[14px] leading-relaxed text-[var(--oh-text-secondary)]">
          {message}
        </p>

        <div className="flex justify-end gap-2.5 border-t border-[var(--oh-border)] px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 rounded-[var(--oh-radius)] bg-[#e8e8e8] px-5 py-2 text-[14px] font-medium text-[var(--oh-text)] transition-colors hover:bg-[#dcdcdc] disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`min-h-11 rounded-[var(--oh-radius)] px-5 py-2 text-[14px] font-semibold text-white transition-colors disabled:opacity-60 ${styles.confirmBg} ${styles.confirmHover}`}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
