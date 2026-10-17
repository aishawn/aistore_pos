"use client";

import { useEffect, useRef } from "react";

type DialogHandler = (event: KeyboardEvent) => void;

// Keep one Escape owner when a page temporarily renders a nested dialog.
const activeDialogHandlers: DialogHandler[] = [];

function visibleFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.getClientRects().length > 0 && !element.hasAttribute("aria-hidden"));
}

/** Adds Escape handling and restores focus to the control that opened a dialog. */
export function useDialogFocus(
  open: boolean,
  onClose: () => void,
  focusKey?: string | number | boolean | null,
) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusInitialControl = () => {
      const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')]
        .filter((dialog) => dialog.getClientRects().length > 0);
      const dialog = dialogs.at(-1);
      visibleFocusableElements(dialog ?? document.body)[0]?.focus();
    };
    const frame = window.requestAnimationFrame(focusInitialControl);
    function handleKeyDown(event: KeyboardEvent) {
      if (activeDialogHandlers.at(-1) !== handleKeyDown) return;
      const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')]
        .filter((dialog) => dialog.getClientRects().length > 0);
      const dialog = dialogs.at(-1);
      if (event.key === "Tab" && dialog) {
        const focusable = visibleFocusableElements(dialog);
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable.at(-1) as HTMLElement;
        if (!dialog.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    activeDialogHandlers.push(handleKeyDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      const handlerIndex = activeDialogHandlers.lastIndexOf(handleKeyDown);
      if (handlerIndex >= 0) activeDialogHandlers.splice(handlerIndex, 1);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
      previousFocusRef.current = null;
    };
  }, [focusKey, open]);
}
