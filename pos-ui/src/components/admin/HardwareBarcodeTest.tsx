"use client";

import { useEffect, useState } from "react";

const KEY = "orithos-barcode-scanner-tested";

/** Local keyboard-wedge scanner check — does not claim printer/drawer connectivity. */
export function HardwareBarcodeTest() {
  const [value, setValue] = useState("");
  const [testedAt, setTestedAt] = useState<string | null>(null);

  useEffect(() => {
    try {
      setTestedAt(localStorage.getItem(KEY));
    } catch {
      setTestedAt(null);
    }
  }, []);

  function markTested(raw: string) {
    const stamp = new Date().toISOString();
    try {
      localStorage.setItem(KEY, stamp);
    } catch {
      /* ignore */
    }
    setTestedAt(stamp);
    setValue(raw);
  }

  return (
    <section className="mt-6 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
      <h2 className="text-sm font-semibold text-[var(--oh-text)]">Barcode scanner — local test</h2>
      <p className="mt-1 text-sm text-[var(--oh-muted)]">
        Focus the field and scan a barcode (keyboard wedge). This only proves input on this browser; it does not configure a printer or cash drawer.
      </p>
      <label className="mt-3 block text-sm">
        <span className="mb-1.5 block font-medium">Scan here</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              e.preventDefault();
              markTested(value.trim());
            }
          }}
          className="h-11 w-full max-w-md rounded-lg border border-[var(--oh-border)] px-3"
          placeholder="Scan or type then Enter"
          autoComplete="off"
        />
      </label>
      {testedAt && (
        <p className="mt-2 text-xs font-semibold text-emerald-800">
          Last local scan recorded {new Date(testedAt).toLocaleString()}
          {value ? ` · “${value}”` : ""}
        </p>
      )}
    </section>
  );
}
