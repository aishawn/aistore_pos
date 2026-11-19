"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { connectLocalHardware } from "@/lib/local-hardware";

/** Probes Orithos Hardware Connect first; loads QZ Tray only when HC is unavailable. */
export function LocalQzBridge() {
  const attempted = useRef(false);
  const [loadQz, setLoadQz] = useState(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    void connectLocalHardware()
      .then((next) => {
        if (next.bridge !== "orithos-hc" && !next.connected) setLoadQz(true);
      })
      .catch(() => setLoadQz(true));
  }, []);

  if (!loadQz) return null;

  return (
    <Script
      src="https://cdn.jsdelivr.net/npm/qz-tray@2.3.0/qz-tray.js"
      strategy="lazyOnload"
      onLoad={() => {
        void connectLocalHardware().catch(() => undefined);
      }}
    />
  );
}