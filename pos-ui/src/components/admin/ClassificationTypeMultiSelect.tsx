"use client";

import { useEffect, useRef, useState } from "react";
import { SelectChevronIcon } from "@/components/icons";

export const CLASSIFICATION_TYPE_OPTIONS = [
  { label: "Brand", value: "brand" },
  { label: "Category", value: "category" },
  { label: "Family", value: "family" },
  { label: "Tag", value: "tag" },
] as const;

export type ClassificationTypeValue = "brand" | "category" | "family" | "tag";

const TYPE_LABELS: Record<ClassificationTypeValue, string> = {
  brand: "Brand",
  category: "Category",
  family: "Family",
  tag: "Tag",
};

/**
 * Multi-select for classification types on the Classifications list page.
 * Brand, Category, Family, and Tag are sibling options (no hierarchy).
 */
export function ClassificationTypeMultiSelect({
  values,
  onChange,
  defaultOpen = false,
  embedded = false,
}: {
  values: ClassificationTypeValue[];
  onChange: (values: ClassificationTypeValue[]) => void;
  /** When true, the checkbox list starts expanded. */
  defaultOpen?: boolean;
  /** When true, always show the checkbox list in-flow (for page Menu panels). */
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || embedded);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listOpen = embedded || open;

  useEffect(() => {
    if (embedded || !open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [embedded, open]);

  const toggle = (value: ClassificationTypeValue) => {
    onChange(
      values.includes(value) ? values.filter((v) => v !== value) : [...values, value],
    );
  };

  const optionList = (
    <div
      className={
        embedded
          ? "mt-1.5 overflow-hidden rounded-lg border border-[var(--oh-border)] bg-[var(--oh-tile-blue-bg)] py-1"
: "absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] py-1 shadow-[var(--oh-shadow-card)]"
      }
    >
      {CLASSIFICATION_TYPE_OPTIONS.map((option) => (
        <label
          key={option.value}
          className={`flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] text-[var(--oh-text)] hover:bg-[var(--oh-surface)] ${
            values.includes(option.value) && !embedded ? "bg-[var(--oh-tile-blue-bg)]" : ""
          }`}
        >
          <input
            type="checkbox"
            checked={values.includes(option.value)}
            onChange={() => toggle(option.value)}
            className="h-4 w-4 accent-[var(--oh-primary)]"
          />
          {option.label}
        </label>
      ))}
    </div>
  );

  return (
    <div ref={wrapRef} className="relative block">
      <span className="mb-1.5 block text-[13px] font-medium text-[var(--oh-text-secondary)]">
        Classifications
      </span>
      <button
        type="button"
        onClick={() => {
          if (!embedded) setOpen((v) => !v);
        }}
        aria-expanded={listOpen}
        aria-haspopup="listbox"
        className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-1.5 text-left outline-none focus:border-[var(--oh-info)] focus:ring-1 focus:ring-[var(--oh-info)]"
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {values.length === 0 ? (
            <span className="text-[13px] text-[var(--oh-placeholder)]">Select types…</span>
          ) : (
            values.map((value) => (
              <span
                key={value}
                className="rounded bg-[var(--oh-border)] px-2 py-0.5 text-[13px] text-[var(--oh-text-secondary)]"
              >
                {TYPE_LABELS[value]}
              </span>
            ))
          )}
        </span>
        {!embedded && (
          <SelectChevronIcon
            size={16}
            className={`shrink-0 text-[var(--oh-muted)] transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {listOpen && optionList}
    </div>
  );
}
