"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { SelectChevronIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function buildMonthGrid(month: Date) {
  const first = startOfMonth(month);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return { date, inMonth: date.getMonth() === month.getMonth() };
  });
}

function buildCurrentMonthDays(month: Date) {
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
    return { date, inMonth: true };
  });
}

function MonthPanel({
  month,
  selected,
  today,
  onSelect,
  currentMonthOnly = false,
}: {
  month: Date;
  selected: Date | null;
  today: Date;
  onSelect: (date: Date) => void;
  currentMonthOnly?: boolean;
}) {
  const days = useMemo(
    () => (currentMonthOnly ? buildCurrentMonthDays(month) : buildMonthGrid(month)),
    [month, currentMonthOnly],
  );

  if (currentMonthOnly) {
    return (
      <div className="min-w-0 flex-1">
        <div className="mb-2 text-center text-[14px] font-medium text-[var(--oh-text)]">
          {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center text-[13px]">
          {WEEKDAYS.map((day) => (
            <div key={day} className="py-1 text-[var(--oh-muted)]">
              {day}
            </div>
          ))}
          {Array.from({ length: (startOfMonth(month).getDay() + 6) % 7 }).map((_, index) => (
            <div key={`pad-${index}`} className="h-8 w-8" />
          ))}
          {days.map(({ date }) => {
            const isSelected = selected ? sameDay(date, selected) : false;
            const isToday = sameDay(date, today);
            return (
              <button
                key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
                type="button"
                onClick={() => onSelect(date)}
                className={cn(
                  "mx-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                  "text-[var(--oh-info)] hover:bg-[#e8f2fb]",
                  isSelected && "ring-2 ring-[var(--oh-info)] ring-offset-1",
                  !isSelected && isToday && "bg-[#e8f2fb]",
                )}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-2 text-center text-[14px] font-medium text-[var(--oh-text)]">
        {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[13px]">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-1 text-[var(--oh-muted)]">
            {day}
          </div>
        ))}
        {days.map(({ date, inMonth }) => {
          const isSelected = selected ? sameDay(date, selected) : false;
          const isToday = sameDay(date, today);
          return (
            <button
              key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
              type="button"
              onClick={() => onSelect(date)}
              className={cn(
                "mx-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                inMonth ? "text-[var(--oh-info)] hover:bg-[#e8f2fb]" : "text-[var(--oh-placeholder)]",
                isSelected && "ring-2 ring-[var(--oh-info)] ring-offset-1",
                !isSelected && isToday && inMonth && "bg-[#e8f2fb]",
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FormDatePicker({
  value,
  onChange,
  placeholder = "Birthday",
  ariaLabel,
  compact = false,
  showTodayWhenToday = false,
  currentMonthOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  compact?: boolean;
  showTodayWhenToday?: boolean;
  currentMonthOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [leftMonth, setLeftMonth] = useState(() => startOfMonth(new Date()));
  const [segmentFocus, setSegmentFocus] = useState<"year" | "month" | "day">("year");
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = parseIsoDate(value);
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const segments = useMemo(() => {
    if (selected) {
      return {
        year: String(selected.getFullYear()),
        month: String(selected.getMonth() + 1).padStart(2, "0"),
        day: String(selected.getDate()).padStart(2, "0"),
      };
    }
    return { year: "", month: "", day: "" };
  }, [selected]);

  const rightMonth = addMonths(leftMonth, 1);
  const displayValue = useMemo(() => {
    if (!selected) return "";
    if (showTodayWhenToday && sameDay(selected, today)) return placeholder;
    return selected.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }, [selected, showTodayWhenToday, today, placeholder]);

  function closePicker() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function openPicker() {
    setOpen(true);
    setLeftMonth(startOfMonth(selected ?? today));
    setSegmentFocus("year");
  }

  function selectDate(date: Date) {
    onChange(toIsoDate(date));
    setLeftMonth(startOfMonth(date));
    closePicker();
  }

  function applySegments(next: { year: string; month: string; day: string }) {
    if (next.year.length === 4 && next.month.length >= 1 && next.day.length >= 1) {
      const iso = `${next.year}-${next.month.padStart(2, "0")}-${next.day.padStart(2, "0")}`;
      const parsed = parseIsoDate(iso);
      if (parsed) {
        onChange(iso);
        setLeftMonth(startOfMonth(parsed));
      }
    } else if (!next.year && !next.month && !next.day) {
      onChange("");
    }
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) closePicker();
    }
    document.addEventListener("mousedown", onPointerDown);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePicker();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative" data-select-open={open || undefined}>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPicker}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={cn(
          "flex w-full items-center border border-[var(--oh-border)] bg-white text-left outline-none focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]",
            compact
            ? "min-h-11 justify-between rounded-lg px-3 text-[14px]"
            : "h-10 rounded-[var(--oh-radius)] px-3 text-[14px]",
          displayValue ? "text-[var(--oh-text)]" : "text-[var(--oh-placeholder)]",
        )}
      >
        <span>{displayValue || placeholder}</span>
        {compact && <SelectChevronIcon size={14} className="shrink-0 text-neutral-500" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`${ariaLabel ?? placeholder} calendar`}
          className={cn(
            "absolute z-[200] mt-1 rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]",
            currentMonthOnly ? "w-[min(100vw-2rem,320px)]" : "w-[min(100vw-2rem,560px)]",
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center rounded-[var(--oh-radius)] border border-[var(--oh-border)] px-3 py-2 text-[14px]">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={segments.year}
                  placeholder="YYYY"
                  onFocus={() => setSegmentFocus("year")}
                  onChange={(e) => {
                    const year = e.target.value.replace(/\D/g, "").slice(0, 4);
                    applySegments({ ...segments, year });
                  }}
                  className={cn(
                    "w-12 bg-transparent text-center outline-none placeholder:text-[var(--oh-placeholder)]",
                    segmentFocus === "year" && "rounded bg-[#e8f2fb] text-[var(--oh-info)]",
                  )}
                />
                <span className="text-[var(--oh-muted)]">/</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={segments.month}
                  placeholder="MM"
                  onFocus={() => setSegmentFocus("month")}
                  onChange={(e) => {
                    const month = e.target.value.replace(/\D/g, "").slice(0, 2);
                    applySegments({ ...segments, month });
                  }}
                  className={cn(
                    "w-8 bg-transparent text-center outline-none placeholder:text-[var(--oh-placeholder)]",
                    segmentFocus === "month" && "rounded bg-[#e8f2fb] text-[var(--oh-info)]",
                  )}
                />
                <span className="text-[var(--oh-muted)]">/</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={segments.day}
                  placeholder="DD"
                  onFocus={() => setSegmentFocus("day")}
                  onChange={(e) => {
                    const day = e.target.value.replace(/\D/g, "").slice(0, 2);
                    applySegments({ ...segments, day });
                  }}
                  className={cn(
                    "w-8 bg-transparent text-center outline-none placeholder:text-[var(--oh-placeholder)]",
                    segmentFocus === "day" && "rounded bg-[#e8f2fb] text-[var(--oh-info)]",
                  )}
                />
              </div>
              <Calendar size={16} className="mt-2 text-[var(--oh-info)]" strokeWidth={1.75} />
            </div>
            <button
              type="button"
              onClick={() => selectDate(today)}
              className="min-h-11 shrink-0 px-2 text-[13px] font-medium text-[var(--oh-text-secondary)] hover:text-[var(--oh-info)]"
            >
              Current Day
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setLeftMonth((month) => addMonths(month, -1))}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
            >
              <ChevronLeft size={18} />
            </button>

            <div className={cn("flex min-w-0 flex-1", !currentMonthOnly && "gap-4")}>
              <MonthPanel
                month={leftMonth}
                selected={selected}
                today={today}
                onSelect={selectDate}
                currentMonthOnly={currentMonthOnly}
              />
              {!currentMonthOnly && (
                <MonthPanel month={rightMonth} selected={selected} today={today} onSelect={selectDate} />
              )}
            </div>

            <button
              type="button"
              aria-label="Next month"
              onClick={() => setLeftMonth((month) => addMonths(month, 1))}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
