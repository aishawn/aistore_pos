"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { connectLocalHardware } from "@/lib/local-hardware";

/** Loads QZ Tray and reconnects once per sell/hardware session for receipt printing. */
export function LocalQzBridge() {
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    void connectLocalHardware().catch(() => undefined);
  }, []);

  return (
    <Script
      src="https://cdn.jsdelivr.net/npm/qz-tray@2.3.0/qz-tray.js"
      strategy="afterInteractive"
      onLoad={() => {
        void connectLocalHardware().catch(() => undefined);
      }}
    />
  );
}