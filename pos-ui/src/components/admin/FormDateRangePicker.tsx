"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { SelectChevronIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useDialogFocus } from "@/hooks/useDialogFocus";

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

function formatDdMmYyyy(iso: string): string {
  const date = parseIsoDate(iso);
  if (!date) return "";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function compareDays(a: Date, b: Date) {
  return a.getTime() - b.getTime();
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

function normalizeRange(startIso: string, endIso: string): { start: string; end: string } {
  const startDate = parseIsoDate(startIso);
  const endDate = parseIsoDate(endIso);
  if (!startDate || !endDate) return { start: startIso, end: endIso };
  if (compareDays(startDate, endDate) <= 0) return { start: startIso, end: endIso };
  return { start: endIso, end: startIso };
}

function DateSegmentInput({
  part,
  value,
  onChange,
  onClear,
  active,
  onFocus,
}: {
  part: "start" | "end";
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  active: boolean;
  onFocus: () => void;
}) {
  const selected = parseIsoDate(value);
  const segments = selected
    ? {
        year: String(selected.getFullYear()),
        month: String(selected.getMonth() + 1).padStart(2, "0"),
        day: String(selected.getDate()).padStart(2, "0"),
      }
    : { year: "", month: "", day: "" };

  function applySegments(next: { year: string; month: string; day: string }) {
    if (next.year.length === 4 && next.month.length >= 1 && next.day.length >= 1) {
      const iso = `${next.year}-${next.month.padStart(2, "0")}-${next.day.padStart(2, "0")}`;
      const parsed = parseIsoDate(iso);
      if (parsed) onChange(iso);
    } else if (!next.year && !next.month && !next.day) {
      onChange("");
    }
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-1 rounded-md border px-2.5 py-2 text-[14px]",
        active ? "border-[var(--oh-primary)] ring-1 ring-[var(--oh-primary)]" : "border-[var(--oh-border)]",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center" onFocusCapture={onFocus}>
        <input
          type="text"
          inputMode="numeric"
          aria-label={`${part === "start" ? "Start" : "End"} year`}
          maxLength={4}
          value={segments.year}
          placeholder="YYYY"
          onFocus={onFocus}
          onChange={(e) => {
            const year = e.target.value.replace(/\D/g, "").slice(0, 4);
            applySegments({ ...segments, year });
          }}
          className="w-12 bg-transparent text-center outline-none placeholder:text-[var(--oh-placeholder)]"
        />
        <span className="text-[var(--oh-muted)]">/</span>
        <input
          type="text"
          inputMode="numeric"
          aria-label={`${part === "start" ? "Start" : "End"} month`}
          maxLength={2}
          value={segments.month}
          placeholder="MM"
          onFocus={onFocus}
          onChange={(e) => {
            const month = e.target.value.replace(/\D/g, "").slice(0, 2);
            applySegments({ ...segments, month });
          }}
          className="w-8 bg-transparent text-center outline-none placeholder:text-[var(--oh-placeholder)]"
        />
        <span className="text-[var(--oh-muted)]">/</span>
        <input
          type="text"
          inputMode="numeric"
          aria-label={`${part === "start" ? "Start" : "End"} day`}
          maxLength={2}
          value={segments.day}
          placeholder="DD"
          onFocus={onFocus}
          onChange={(e) => {
            const day = e.target.value.replace(/\D/g, "").slice(0, 2);
            applySegments({ ...segments, day });
          }}
          className="w-8 bg-transparent text-center outline-none placeholder:text-[var(--oh-placeholder)]"
        />
      </div>
      {value ? (
        <button
          type="button"
          aria-label={`Clear ${part === "start" ? "start" : "end"} date`}
          onClick={onClear}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

function RangeMonthPanel({
  month,
  rangeStart,
  rangeEnd,
  hoverDate,
  today,
  onSelect,
  onHover,
}: {
  month: Date;
  rangeStart: Date | null;
  rangeEnd: Date | null;
  hoverDate: Date | null;
  today: Date;
  onSelect: (date: Date) => void;
  onHover: (date: Date | null) => void;
}) {
  const days = useMemo(() => buildMonthGrid(month), [month]);

  const previewEnd = rangeEnd ?? hoverDate;
  const effectiveStart = rangeStart;
  const effectiveEnd =
    effectiveStart && previewEnd
      ? compareDays(effectiveStart, previewEnd) <= 0
        ? previewEnd
        : effectiveStart
      : null;
  const effectiveStartDay =
    effectiveStart && effectiveEnd && previewEnd && compareDays(effectiveStart, previewEnd) > 0
      ? previewEnd
      : effectiveStart;

  function isInRange(date: Date) {
    if (!effectiveStartDay || !effectiveEnd) return false;
    const time = date.getTime();
    return time >= effectiveStartDay.getTime() && time <= effectiveEnd.getTime();
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
          const isStart = Boolean(rangeStart && sameDay(date, rangeStart));
          const isEnd = Boolean(rangeEnd && sameDay(date, rangeEnd));
          const isEndpoint = isStart || isEnd;
          const isToday = sameDay(date, today);
          const inRange = isInRange(date);
          return (
            <button
              key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
              type="button"
              aria-label={`${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`}
              aria-pressed={isEndpoint}
              onClick={() => onSelect(date)}
              onMouseEnter={() => onHover(date)}
              onMouseLeave={() => onHover(null)}
              className={cn(
                "relative mx-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]",
                inMonth ? "text-[var(--oh-primary)] hover:bg-[var(--oh-orange-light)]" : "text-[var(--oh-placeholder)]",
                inRange && inMonth && !isEndpoint && "bg-[var(--oh-orange-light)]",
                isStart && "bg-[var(--oh-primary)] font-semibold text-white hover:bg-[var(--oh-primary)]",
                isEnd && !isStart && "bg-white font-semibold text-[var(--oh-primary)] ring-2 ring-[var(--oh-primary)]",
                !isEndpoint && isToday && inMonth && "bg-[var(--oh-orange-light)]",
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

export function getDefaultStatementDateRange(): { start: string; end: string } {
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), 0);
  const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 0);
  return { start: toIsoDate(startDate), end: toIsoDate(endDate) };
}

/** Date range field: one click opens a dual-month popover to pick start and end. */
export function FormDateRangePicker({
  start,
  end,
  onChange,
  placeholder = "DD/MM/YYYY — DD/MM/YYYY",
  ariaLabel,
  compact = false,
}: {
  start: string;
  end: string;
  onChange: (range: { start: string; end: string }) => void;
  placeholder?: string;
  ariaLabel?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [leftMonth, setLeftMonth] = useState(() => startOfMonth(new Date()));
  const [activeInput, setActiveInput] = useState<"start" | "end">("start");
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const display =
    start && end
      ? `${formatDdMmYyyy(start)} — ${formatDdMmYyyy(end)}`
      : start
        ? `${formatDdMmYyyy(start)} — DD/MM/YYYY`
        : end
          ? `DD/MM/YYYY — ${formatDdMmYyyy(end)}`
          : placeholder;

  const rightMonth = addMonths(leftMonth, 1);

  function openPicker() {
    setOpen(true);
    setLeftMonth(startOfMonth(startDate ?? endDate ?? today));
    setActiveInput(start && !end ? "end" : "start");
    setHoverDate(null);
  }

  function closePicker() {
    setOpen(false);
    setHoverDate(null);
    triggerRef.current?.focus();
  }

  useDialogFocus(open, closePicker);

  function selectDate(date: Date) {
    const iso = toIsoDate(date);
    if (!start || (start && end)) {
      onChange({ start: iso, end: "" });
      setActiveInput("end");
      setLeftMonth(startOfMonth(date));
      return;
    }
    onChange(normalizeRange(start, iso));
    setActiveInput("start");
    setLeftMonth(startOfMonth(date));
    closePicker();
  }

  function setCurrentDay() {
    const iso = toIsoDate(today);
    onChange({ start: iso, end: iso });
    setLeftMonth(startOfMonth(today));
    setActiveInput("start");
    closePicker();
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) closePicker();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative w-full min-w-0" data-select-open={open || undefined}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closePicker() : openPicker())}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={cn(
          "flex w-full items-center gap-2 text-left outline-none focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]",
          compact
            ? "min-h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-[14px] text-[var(--oh-text)]"
            : "h-10 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[14px]",
          start || end ? "text-[var(--oh-text)]" : "text-[var(--oh-placeholder)]",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{display}</span>
        <Calendar size={16} className="shrink-0 text-[var(--oh-text)]" strokeWidth={1.75} aria-hidden />
        <SelectChevronIcon
          size={14}
          className={cn("shrink-0 text-[var(--oh-muted)] transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`${ariaLabel ?? placeholder} calendar`}
          className="absolute left-0 z-[200] mt-1 w-[min(100vw-2rem,560px)] rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)]"
        >
          <div className="mb-3 flex items-center gap-2">
            <DateSegmentInput
              part="start"
              value={start}
              active={activeInput === "start"}
              onFocus={() => setActiveInput("start")}
              onChange={(value) => onChange(value && end ? normalizeRange(value, end) : { start: value, end })}
              onClear={() => onChange({ start: "", end })}
            />
            <span className="shrink-0 text-[var(--oh-muted)]">—</span>
            <DateSegmentInput
              part="end"
              value={end}
              active={activeInput === "end"}
              onFocus={() => setActiveInput("end")}
              onChange={(value) => onChange(start && value ? normalizeRange(start, value) : { start, end: value })}
              onClear={() => onChange({ start, end: "" })}
            />
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <Calendar size={16} className="text-[var(--oh-primary)]" strokeWidth={1.75} aria-hidden />
            <button
              type="button"
              onClick={setCurrentDay}
              className="min-h-11 shrink-0 px-2 text-[13px] font-medium text-[var(--oh-text-secondary)] hover:text-[var(--oh-primary)]"
            >
              Current Day
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setLeftMonth((month) => addMonths(month, -1))}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--oh-primary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="flex min-w-0 flex-1 gap-4">
              <RangeMonthPanel
                month={leftMonth}
                rangeStart={startDate}
                rangeEnd={endDate}
                hoverDate={hoverDate}
                today={today}
                onSelect={selectDate}
                onHover={setHoverDate}
              />
              <RangeMonthPanel
                month={rightMonth}
                rangeStart={startDate}
                rangeEnd={endDate}
                hoverDate={hoverDate}
                today={today}
                onSelect={selectDate}
                onHover={setHoverDate}
              />
            </div>

            <button
              type="button"
              aria-label="Next month"
              onClick={() => setLeftMonth((month) => addMonths(month, 1))}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--oh-primary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
