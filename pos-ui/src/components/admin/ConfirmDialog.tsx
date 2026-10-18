"use client";

import { useId } from "react";
import { DeleteIcon, QuestionIcon } from "@/components/icons";
import { useDialogFocus } from "@/hooks/useDialogFocus";

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
  error = null,
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
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogId = useId();
  useDialogFocus(open, () => {
    if (!busy) onCancel();
  });

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
        aria-labelledby={`${dialogId}-title`}
        aria-describedby={`${dialogId}-message`}
        className="flex w-full max-w-[420px] flex-col overflow-hidden rounded-[var(--oh-radius)] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center gap-2.5 px-5 py-4 ${styles.headerBg}`}>
          <HeaderIcon size={20} className={`shrink-0 ${styles.headerText}`} strokeWidth={2} />
          <h2 id={`${dialogId}-title`} className={`text-[16px] font-semibold ${styles.headerText}`}>
            {title}
          </h2>
        </div>

        <p id={`${dialogId}-message`} className="px-5 py-5 text-[14px] leading-relaxed text-[var(--oh-text-secondary)]">
          {message}
        </p>

        {error ? (
          <p role="alert" className="mx-5 mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-relaxed text-rose-800">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2.5 border-t border-[var(--oh-border)] px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 rounded-[var(--oh-radius)] bg-[#e8e8e8] px-5 py-2 text-[14px] font-medium text-[var(--oh-text)] transition-colors hover:bg-[#dcdcdc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`min-h-11 rounded-[var(--oh-radius)] px-5 py-2 text-[14px] font-semibold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60 ${styles.confirmBg} ${styles.confirmHover}`}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
