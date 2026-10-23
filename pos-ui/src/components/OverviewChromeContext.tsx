"use client";

import { createContext, useContext } from "react";

/** Slim account chrome for Overview routes when AppShell Sidebar/Header are hidden. */
export type OverviewChromeValue = {
  userName: string;
  userMenuOpen: boolean;
  toggleUserMenu: () => void;
};

const OverviewChromeContext = createContext<OverviewChromeValue | null>(null);

export function OverviewChromeProvider({
  value,
  children,
}: {
  value: OverviewChromeValue;
  children: React.ReactNode;
}) {
  return (
    <OverviewChromeContext.Provider value={value}>{children}</OverviewChromeContext.Provider>
  );
}

export function useOverviewChrome(): OverviewChromeValue | null {
  return useContext(OverviewChromeContext);
}
