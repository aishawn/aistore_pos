"use client";

import { useId } from "react";
import { InfoIcon } from "@/components/icons";
import { TriangleAlert } from "lucide-react";
import { useDialogFocus } from "@/hooks/useDialogFocus";

type AlertVariant = "warning" | "danger" | "info";

const VARIANT_STYLES: Record<
  AlertVariant,
  {
    headerBg: string;
    headerText: string;
    buttonBg: string;
    buttonHover: string;
    Icon: typeof InfoIcon;
  }
> = {
  warning: {
    headerBg: "bg-[var(--oh-tile-orange-bg)]",
    headerText: "text-[var(--oh-tile-orange-text)]",
    buttonBg: "bg-[var(--oh-primary)]",
    buttonHover: "hover:bg-[var(--oh-primary-hover)]",
    Icon: TriangleAlert,
  },
  danger: {
    headerBg: "bg-[#fdecea]",
    headerText: "text-[#c62828]",
    buttonBg: "bg-[#e2231a]",
    buttonHover: "hover:bg-[#c91c14]",
    Icon: TriangleAlert,
  },
  info: {
    headerBg: "bg-[var(--oh-tile-blue-bg)]",
    headerText: "text-[var(--oh-tile-blue-text)]",
    buttonBg: "bg-[#00a3ee]",
    buttonHover: "hover:bg-[#0090d4]",
    Icon: InfoIcon,
  },
};

/** Centered alert dialog to replace native browser alert(). */
export function AlertDialog({
  open,
  title,
  message,
  okLabel = "OK",
  variant = "warning",
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  okLabel?: string;
  variant?: AlertVariant;
  onClose: () => void;
}) {
  const dialogId = useId();
  useDialogFocus(open, onClose);

  if (!open) return null;

  const styles = VARIANT_STYLES[variant];
  const HeaderIcon = styles.Icon;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4 font-sans backdrop-blur-[2px]"
      onClick={onClose}
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

        <div className="flex justify-end border-t border-[var(--oh-border)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className={`min-h-11 rounded-[var(--oh-radius)] px-5 py-2 text-[14px] font-semibold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] ${styles.buttonBg} ${styles.buttonHover}`}
          >
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
