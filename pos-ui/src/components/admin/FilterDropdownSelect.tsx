"use client";

import { useEffect, useRef, useState } from "react";
import { SelectChevronIcon, XIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { uniqueSelectOptions, type SelectOption } from "@/components/admin/FilterSelect";

/**
 * Single-select dropdown for admin filter rows. Custom popup list without checkboxes.
 */
export function FilterDropdownSelect({
  label,
  placeholder = "Select…",
  options,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeMenu = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const uniqueOptions = uniqueSelectOptions(options);
  const display = value ? (uniqueOptions.find((o) => o.value === value)?.label ?? placeholder) : placeholder;

  return (
    <div ref={wrapRef} className="relative flex min-w-0 flex-1 flex-col font-sans">
      <span className="mb-1.5 text-[13px] font-medium text-[var(--oh-text-secondary)]">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 min-w-0 flex-1 items-center justify-between rounded-lg border border-[var(--oh-border)] bg-white px-3 text-[14px] outline-none focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]"
        >
          <span className={value ? "truncate text-[var(--oh-text)]" : "truncate text-[var(--oh-placeholder)]"}>{display}</span>
          <SelectChevronIcon size={14} className="shrink-0 text-neutral-500" />
        </button>
        {value && (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            onClick={() => onChange("")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-neutral-400 hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
          >
            <XIcon size={14} />
          </button>
        )}
      </div>

      {open && (
        <div role="listbox" aria-label={label} className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-lg border border-[var(--oh-border)] bg-white py-1 shadow-lg">
          {uniqueOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={value === o.value}
              onClick={() => {
                onChange(o.value);
                closeMenu();
              }}
              className={cn(
                "flex min-h-11 w-full items-center px-3 py-2 text-left text-[14px] text-[var(--oh-text)] hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--oh-primary)]",
                value === o.value && "bg-neutral-50 font-medium",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
