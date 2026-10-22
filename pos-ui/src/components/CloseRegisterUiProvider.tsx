"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { OdooCloseRegisterModal } from "@/components/OdooCloseRegisterModal";

type CloseRegisterUiContextValue = {
  openCloseRegister: () => void;
  closeCloseRegister: () => void;
};

const CloseRegisterUiContext = createContext<CloseRegisterUiContextValue | null>(null);

/** App-wide Close Register modal host (POS icon + admin menu). */
export function CloseRegisterUiProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const openCloseRegister = useCallback(() => setOpen(true), []);
  const closeCloseRegister = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ openCloseRegister, closeCloseRegister }),
    [openCloseRegister, closeCloseRegister],
  );

  return (
    <CloseRegisterUiContext.Provider value={value}>
      {children}
      <OdooCloseRegisterModal open={open} onClose={closeCloseRegister} />
    </CloseRegisterUiContext.Provider>
  );
}

export function useCloseRegisterUi(): CloseRegisterUiContextValue {
  const context = useContext(CloseRegisterUiContext);
  if (!context) {
    throw new Error("useCloseRegisterUi must be used within CloseRegisterUiProvider");
  }
  return context;
}

/** Safe hook for optional usage outside the provider (returns no-ops). */
export function useCloseRegisterUiOptional(): CloseRegisterUiContextValue {
  const context = useContext(CloseRegisterUiContext);
  return context ?? {
    openCloseRegister: () => {},
    closeCloseRegister: () => {},
  };
}
