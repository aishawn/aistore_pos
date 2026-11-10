"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { NativeSalesHistoryModal } from "@/components/NativeSalesHistoryModal";

type SalesHistoryUiContextValue = {
  openSalesHistory: (status?: string) => void;
  closeSalesHistory: () => void;
};

const SalesHistoryUiContext = createContext<SalesHistoryUiContextValue | null>(null);

/** App-wide Sales History modal host (POS toolbar + user menu) — Orithos ledger only. */
export function SalesHistoryUiProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const openSalesHistory = useCallback((_status?: string) => { setOpen(true); }, []);
  const closeSalesHistory = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ openSalesHistory, closeSalesHistory }),
    [openSalesHistory, closeSalesHistory],
  );

  return (
    <SalesHistoryUiContext.Provider value={value}>
      {children}
      <NativeSalesHistoryModal open={open} onClose={closeSalesHistory} />
    </SalesHistoryUiContext.Provider>
  );
}

export function useSalesHistoryUi(): SalesHistoryUiContextValue {
  const context = useContext(SalesHistoryUiContext);
  if (!context) {
    throw new Error("useSalesHistoryUi must be used within SalesHistoryUiProvider");
  }
  return context;
}

/** Safe hook for optional usage outside the provider (returns no-ops). */
export function useSalesHistoryUiOptional(): SalesHistoryUiContextValue {
  const context = useContext(SalesHistoryUiContext);
  return context ?? {
    openSalesHistory: () => {},
    closeSalesHistory: () => {},
  };
}
