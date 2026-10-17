"use client";

import { useEffect, useRef } from "react";

type DialogHandler = (event: KeyboardEvent) => void;

// Keep one Escape owner when a page temporarily renders a nested dialog.
const activeDialogHandlers: DialogHandler[] = [];

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
      dialog?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus();
    };
    const frame = window.requestAnimationFrame(focusInitialControl);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && activeDialogHandlers.at(-1) === handleKeyDown) {
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
