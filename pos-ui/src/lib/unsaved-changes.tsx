"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";

type UnsavedChangesContextValue = {
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
  /** Reads registered page checker first, then context ref. */
  isDirtyNow: () => boolean;
  registerDirtyChecker: (checker: (() => boolean) | null) => void;
  confirmNavigation: (action: () => void, dirty?: boolean) => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setDirtyState] = useState(false);
  const isDirtyRef = useRef(false);
  const dirtyCheckerRef = useRef<(() => boolean) | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const setDirty = useCallback((dirty: boolean) => {
    isDirtyRef.current = dirty;
    setDirtyState(dirty);
  }, []);

  const registerDirtyChecker = useCallback((checker: (() => boolean) | null) => {
    dirtyCheckerRef.current = checker;
  }, []);

  const isDirtyNow = useCallback(() => {
    if (dirtyCheckerRef.current?.()) return true;
    return isDirtyRef.current;
  }, []);

  const confirmNavigation = useCallback(
    (action: () => void, dirty?: boolean) => {
      const shouldConfirm = dirty ?? isDirtyNow();
      if (shouldConfirm) {
        setPendingAction(() => action);
      } else {
        action();
      }
    },
    [isDirtyNow],
  );

  const dialog = (
    <ConfirmDialog
      open={pendingAction !== null}
      title="Unsaved changes"
      message="You have unsaved changes. Leave this page without saving?"
      confirmLabel="Leave"
      cancelLabel="Cancel"
      variant="default"
      onConfirm={() => {
        pendingAction?.();
        setPendingAction(null);
        setDirty(false);
      }}
      onCancel={() => setPendingAction(null)}
    />
  );

  return (
    <UnsavedChangesContext.Provider
      value={{ isDirty, setDirty, isDirtyNow, registerDirtyChecker, confirmNavigation }}
    >
      {children}
      {mounted ? createPortal(dialog, document.body) : null}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) {
    throw new Error("useUnsavedChanges must be used within UnsavedChangesProvider");
  }
  return ctx;
}

/** Safe for components that may render outside the provider (e.g. tests). */
export function useUnsavedChangesOptional() {
  return useContext(UnsavedChangesContext);
}
