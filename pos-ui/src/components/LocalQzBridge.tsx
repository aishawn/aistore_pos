"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { connectLocalHardware, isQzTrayFallbackEnabled } from "@/lib/local-hardware";

const QZ_FALLBACK_DELAY_MS = 4_000;

/** Loads QZ Tray only when legacy fallback is explicitly enabled. Default path is Orithos Hardware Connect. */
export function LocalQzBridge() {
  const attempted = useRef(false);
  const [loadQz, setLoadQz] = useState(false);

  useEffect(() => {
    if (!isQzTrayFallbackEnabled()) return;
    if (attempted.current) return;
    attempted.current = true;
    void (async () => {
      const first = await connectLocalHardware().catch(() => null);
      if (first?.bridge === "orithos-hc" || first?.connected) return;
      await new Promise((resolve) => window.setTimeout(resolve, QZ_FALLBACK_DELAY_MS));
      const second = await connectLocalHardware().catch(() => null);
      if (second?.bridge !== "orithos-hc" && !second?.connected) setLoadQz(true);
    })();
  }, []);

  if (!isQzTrayFallbackEnabled() || !loadQz) return null;

  return (
    <Script
      src="https://cdn.jsdelivr.net/npm/qz-tray@2.3.0/qz-tray.js"
      strategy="lazyOnload"
      onLoad={() => {
        void connectLocalHardware()
          .then((next) => {
            if (next.bridge === "orithos-hc") setLoadQz(false);
          })
          .catch(() => undefined);
      }}
    />
  );
}