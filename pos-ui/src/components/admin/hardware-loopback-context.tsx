"use client";

import { createContext, useContext } from "react";

const HardwareLoopbackContext = createContext(true);

/** False while Chrome loopback access is still prompt/denied — blocks auto localhost probes. */
export function HardwareLoopbackProvider({
  loopbackReady,
  children,
}: {
  loopbackReady: boolean;
  children: React.ReactNode;
}) {
  return <HardwareLoopbackContext.Provider value={loopbackReady}>{children}</HardwareLoopbackContext.Provider>;
}

export function useHardwareLoopbackReady(): boolean {
  return useContext(HardwareLoopbackContext);
}