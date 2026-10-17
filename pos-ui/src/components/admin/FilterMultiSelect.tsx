"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLInputElement | null>>([]);
  const listboxId = useId();
  const optionsRef = useRef(options);
  const valuesRef = useRef(values);
  useEffect(() => {
    optionsRef.current = options;
    valuesRef.current = values;
  }, [options, values]);

  const closeMenu = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const firstSelected = uniqueSelectOptions(optionsRef.current).findIndex((option) => valuesRef.current.includes(option.value));
    const frame = window.requestAnimationFrame(() => {
      optionRefs.current[firstSelected >= 0 ? firstSelected : 0]?.focus();
    });
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKeyDown);
    };
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
      <span className="mb-1 block h-4 truncate whitespace-nowrap text-[13px] font-medium leading-4 text-[var(--oh-text-secondary)]">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 min-w-0 flex-1 items-center justify-between rounded-md border border-[var(--oh-border)] bg-white px-2.5 text-[13px] outline-none focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]"
        >
        <span className={values.length === 0 ? "text-neutral-400" : "text-[var(--oh-text)]"}>{display}</span>
          <SelectChevronIcon size={14} className="shrink-0 text-neutral-500" />
        </button>
        {values.length > 0 && (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            onClick={() => onChange([])}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-neutral-400 hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
          >
            <XIcon size={14} />
          </button>
        )}
      </div>

      {open && (
        <div id={listboxId} role="listbox" aria-label={label} aria-multiselectable="true" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-md border border-[var(--oh-border)] bg-white py-1 shadow-lg">
          {uniqueOptions.map((o, index) => (
            <label
              key={o.value}
              role="option"
              aria-selected={values.includes(o.value)}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--oh-text)] hover:bg-neutral-50 focus-within:bg-neutral-50"
            >
              <input
                type="checkbox"
                ref={(element) => { optionRefs.current[index] = element; }}
                checked={values.includes(o.value)}
                onChange={() => toggle(o.value)}
                onKeyDown={(event) => {
                  if (event.key === "Tab") {
                    closeMenu();
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeMenu();
                    return;
                  }
                  if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
                    event.preventDefault();
                    const nextIndex = event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? uniqueOptions.length - 1
                        : (index + (event.key === "ArrowDown" ? 1 : -1) + uniqueOptions.length) % uniqueOptions.length;
                    optionRefs.current[nextIndex]?.focus();
                  }
                }}
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
