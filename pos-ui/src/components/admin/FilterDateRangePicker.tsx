"use client";

import { FormDateRangePicker } from "@/components/admin/FormDateRangePicker";

export function FilterDateRangePicker({
  label,
  start,
  end,
  onChange,
  placeholder = "DD/MM/YYYY — DD/MM/YYYY",
}: {
  label: string;
  start: string;
  end: string;
  onChange: (range: { start: string; end: string }) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex min-w-[16rem] max-w-full flex-col font-sans sm:min-w-[18rem]">
      <span className="mb-1 block h-4 truncate whitespace-nowrap text-[10px] font-medium uppercase tracking-wide leading-4 text-[var(--oh-muted)]">
        {label}
      </span>
      <FormDateRangePicker
        start={start}
        end={end}
        onChange={onChange}
        placeholder={placeholder}
        ariaLabel={label}
        compact
      />
    </div>
  );
}
