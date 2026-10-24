"use client";

import { useEffect, useState } from "react";

const KEY = "orithos-barcode-probe-ok";

/** Local keyboard-wedge probe — does not claim a hardware driver. */
export function HardwareBarcodeProbe() {
  const [value, setValue] = useState("");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setOk(typeof window !== "undefined" && window.sessionStorage.getItem(KEY) === "1");
  }, []);

  function markOk(next: string) {
    setValue(next);
    if (next.trim().length >= 4) {
      window.sessionStorage.setItem(KEY, "1");
      setOk(true);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
      <h2 className="text-sm font-semibold text-[var(--oh-text)]">Barcode scanner probe</h2>
      <p className="mt-1 text-sm text-[var(--oh-muted)]">
        Focus the field and scan a barcode (keyboard wedge). This only proves input reaches the browser — it does not configure a printer or drawer.
      </p>
      <label className="mt-3 block">
        <span className="sr-only">Scan barcode here</span>
        <input
          value={value}
          onChange={(e) => markOk(e.target.value)}
          placeholder="Scan into this field…"
          className="h-11 w-full max-w-md rounded-lg border border-[var(--oh-border)] px-3 text-sm"
          autoComplete="off"
        />
      </label>
      <p className={`mt-2 text-xs font-semibold ${ok ? "text-emerald-800" : "text-[var(--oh-muted)]"}`}>
        {ok ? "Probe OK for this browser session." : "Not tested this session."}
      </p>
    </section>
  );
}
