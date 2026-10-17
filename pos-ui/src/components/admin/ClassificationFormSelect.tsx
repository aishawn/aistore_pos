"use client";

import { useEffect, useRef, useState } from "react";
import { SelectChevronIcon } from "@/components/icons";

export function ClassificationFormSelect({
  value,
  options,
  onChange,
  onOpen,
  loading = false,
  placeholder = "Select...",
}: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  onOpen?: () => void;
  loading?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) onOpen?.();
  }

  return (
    <div ref={wrapRef} className="relative mt-1">
      <button
        type="button"
        onClick={toggle}
        className="flex min-h-11 w-full items-center justify-between rounded-[var(--oh-radius)] border border-[var(--oh-border-strong)] bg-white px-3 text-[14px] text-[var(--oh-text)] outline-none focus:border-[var(--oh-info)] focus:ring-1 focus:ring-[var(--oh-info)]"
      >
        <span className={selected ? "text-[var(--oh-text)]" : "text-[var(--oh-placeholder)]"}>
          {loading ? "Loading…" : selected?.label ?? placeholder}
        </span>
        <SelectChevronIcon
          size={16}
          className={`text-[var(--oh-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul className="absolute z-[200] mt-1 max-h-48 w-full overflow-auto rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white py-1 shadow-[var(--oh-shadow-card)]">
          {loading ? (
            <li className="px-3 py-2 text-[13px] text-[var(--oh-muted)]">Loading…</li>
          ) : options.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-[var(--oh-muted)]">No options available</li>
          ) : (
            options.map((o, idx) => (
              <li key={`${idx}-${o.value}-${o.label}`}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex min-h-11 w-full px-3 py-2 text-left text-[14px] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--oh-primary)] ${
                    o.value === value ? "bg-[var(--oh-tile-blue-bg)] font-medium text-[var(--oh-tile-blue-text)]" : "text-[var(--oh-text)]"
                  }`}
                >
                  {o.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
