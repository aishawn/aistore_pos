"use client";

import { XIcon } from "@/components/icons";

/** Centered modal dialog with an overlay. */
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 font-sans"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-[520px] flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <h2 className="text-[22px] font-bold text-black">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-neutral-500">
            <XIcon size={22} />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-3 border-t border-neutral-200 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
