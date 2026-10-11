"use client";

import { useEffect, useRef, useState } from "react";
import { SelectChevronIcon, XIcon } from "@/components/icons";
import { uniqueSelectOptions, type SelectOption } from "@/components/admin/FilterSelect";

/**
 * Multi-select dropdown for admin filter rows (e.g. product Status).
 * Matches FilterSelect sizing and typography.
 */
export function FilterMultiSelect({
  label,
  placeholder = "Select...",
  options,
  values,
  onChange,
}: {
  label: string;
  placeholder?: string;
  options: SelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
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

  const display =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? (uniqueOptions.find((o) => o.value === values[0])?.label ?? `${values.length} Selected...`)
        : `${values.length} Selected...`;

  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };

  return (
    <div ref={wrapRef} className="relative flex min-w-0 w-full flex-col font-sans">
      <span className="mb-1 block h-4 truncate whitespace-nowrap text-[12px] font-medium leading-4 text-[var(--oh-text-secondary)]">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-full items-center justify-between rounded-md border border-[var(--oh-border)] bg-white px-2.5 text-[13px] outline-none focus:border-[var(--oh-orange)]"
      >
        <span className={values.length === 0 ? "text-neutral-400" : "text-[var(--oh-text)]"}>{display}</span>
        <span className="flex items-center gap-1.5">
          {values.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange([]);
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
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-md border border-[var(--oh-border)] bg-white py-1 shadow-lg">
          {uniqueOptions.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] text-[var(--oh-text)] hover:bg-neutral-50"
            >
              <input
                type="checkbox"
                checked={values.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="h-4 w-4 accent-[#5cb3e0]"
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
