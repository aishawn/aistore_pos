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

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const uniqueOptions = uniqueSelectOptions(options);
  const display = value ? (uniqueOptions.find((o) => o.value === value)?.label ?? placeholder) : placeholder;

  return (
    <div ref={wrapRef} className="relative flex min-w-0 flex-1 flex-col font-sans">
      <span className="mb-1.5 text-[13px] font-medium text-[var(--oh-text-secondary)]">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-[var(--oh-border)] bg-white px-3 text-[14px] outline-none focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]"
      >
        <span className={value ? "text-[var(--oh-text)]" : "text-[var(--oh-placeholder)]"}>{display}</span>
        <span className="flex items-center gap-1.5">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("");
                }
              }}
              className="text-neutral-400 hover:text-black"
            >
              <XIcon size={14} />
            </span>
          )}
          <SelectChevronIcon size={14} className="text-neutral-500" />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-lg border border-[var(--oh-border)] bg-white py-1 shadow-lg">
          {uniqueOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center px-3 py-2 text-left text-[14px] text-[var(--oh-text)] hover:bg-neutral-50",
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
