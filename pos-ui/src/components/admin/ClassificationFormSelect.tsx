"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selected = options.find((o) => o.value === value);

  function closeMenu() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const selectedIndex = options.findIndex((option) => option.value === value);
    const frame = window.requestAnimationFrame(() => {
      optionRefs.current[selectedIndex >= 0 ? selectedIndex : 0]?.focus();
    });
    function onPointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) closeMenu();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, options, value]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) onOpen?.();
  }

  return (
    <div ref={wrapRef} className="relative mt-1">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
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
        <ul id={listboxId} role="listbox" aria-label={placeholder} className="absolute z-[200] mt-1 max-h-48 w-full overflow-auto rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white py-1 shadow-[var(--oh-shadow-card)]">
          {loading ? (
            <li className="px-3 py-2 text-[13px] text-[var(--oh-muted)]">Loading…</li>
          ) : options.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-[var(--oh-muted)]">No options available</li>
          ) : (
            options.map((o, idx) => (
              <li key={`${idx}-${o.value}-${o.label}`}>
                <button
                  ref={(element) => { optionRefs.current[idx] = element; }}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onKeyDown={(event) => {
                    if (event.key === "Tab") {
                      setOpen(false);
                      return;
                    }
                    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
                    event.preventDefault();
                    const nextIndex = event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? options.length - 1
                        : (idx + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
                    optionRefs.current[nextIndex]?.focus();
                  }}
                  onClick={() => {
                    onChange(o.value);
                    closeMenu();
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
