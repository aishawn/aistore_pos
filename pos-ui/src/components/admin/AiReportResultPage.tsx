"use client";

import { useMemo, useState } from "react";
import {
  ColumnsIcon,
  ExportIcon,
  PrinterIcon,
  RefreshIcon,
  SaveIcon,
  SelectChevronIcon,
  SortArrowsIcon,
} from "@/components/icons";
import { useApi } from "@/hooks/useApi";
import { type AiReportSnapshot } from "@/lib/api";
import { formatReportColumnHeader } from "@/lib/utils";

const INTENT_LABELS: Record<string, string> = {
  report_stock: "Inventory",
  report_sales: "Sales",
  report_qty: "Quantity",
  report_aov: "Average Ticket",
  report_dead_stock: "Dead Stock",
  report_adhoc: "Custom",
};

const EMPTY_COLUMNS: string[] = [];
const EMPTY_ROWS: Record<string, unknown>[] = [];

function intentLabel(intent: string | null): string {
  if (!intent) return "Report";
  const mapped = INTENT_LABELS[intent];
  if (mapped) return mapped;
  return intent.replace(/^report_/, "").replace(/_/g, " ");
}

function cellText(value: unknown): string {
  const v = unwrapJacksonDate(value);
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) {
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Jackson default-typing stored {@code ["java.sql.Date", epochMillis]}. */
function unwrapJacksonDate(value: unknown): unknown {
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "string") {
    return value;
  }
  const type = value[0];
  const payload = value[1];
  if (typeof payload !== "number" || !Number.isFinite(payload)) {
    return value;
  }
  if (/Date$/i.test(type) || type.includes("sql.Date")) {
    const d = new Date(payload);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  if (/Timestamp$/i.test(type) || type === "java.util.Date") {
    const d = new Date(payload);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
  }
  return value;
}

function isNumericColumn(rows: Record<string, unknown>[], col: string): boolean {
  let seen = false;
  for (const row of rows) {
    const v = row[col];
    if (v == null || v === "") continue;
    seen = true;
    if (typeof v === "number") continue;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) continue;
    return false;
  }
  return seen;
}

function columnTotal(rows: Record<string, unknown>[], col: string): string | null {
  if (!isNumericColumn(rows, col)) return null;
  let sum = 0;
  for (const row of rows) {
    const v = row[col];
    if (v == null || v === "") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isNaN(n)) sum += n;
  }
  return Number.isInteger(sum) ? String(sum) : sum.toFixed(2);
}

function downloadCsv(filename: string, columns: string[], rows: Record<string, unknown>[]) {
  const esc = (v: string) => `"${v.replaceAll("\"", "\"\"")}"`;
  const lines = [
    columns.map((col) => esc(formatReportColumnHeader(col))).join(","),
    ...rows.map((row) => columns.map((col) => esc(cellText(row[col]))).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AiReportResultPage({ reportId }: { reportId: string }) {
  const { data, loading, error, reload } = useApi<AiReportSnapshot>(
    reportId ? `/api/ai/reports/${reportId}` : null,
  );
  const [search, setSearch] = useState("");

  const columns = data?.table?.columns ?? EMPTY_COLUMNS;
  const allRows = data?.table?.rows ?? EMPTY_ROWS;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((row) =>
      columns.some((col) => cellText(row[col]).toLowerCase().includes(q)),
    );
  }, [allRows, columns, search]);

  const totals = useMemo(
    () => columns.map((col) => columnTotal(rows, col)),
    [columns, rows],
  );

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="flex h-full items-center justify-center bg-white text-[16px] text-neutral-500">
        Loading report…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-white px-6 text-center text-[16px] text-neutral-500">
        <p role="alert">{error || "Report not found."}</p>
        {error && (
          <button type="button" onClick={reload} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-neutral-300 px-4 py-2 font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
            <RefreshIcon size={16} /> Retry report
          </button>
        )}
      </div>
    );
  }

  const slots = data.slots ?? {};
  const range =
    slots.from && slots.to
      ? slots.from === slots.to
        ? slots.from
        : `${slots.from} – ${slots.to}`
      : slots.from || "Current";

  return (
    <div className="h-full overflow-auto bg-white p-4 font-sans">
      <div className="flex items-center gap-3 rounded-lg border border-neutral-300 px-4 py-2">
        <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[15px] text-neutral-700">
          {data.question || data.title || "AI report"}
        </code>
      </div>

      <div className="mt-4 flex flex-wrap gap-px bg-neutral-300">
        <div className="flex min-w-[280px] flex-1 items-center justify-between bg-[#5f636b] px-4 py-3 text-white">
          <span>
            <span className="block text-[14px] opacity-80">Report Type</span>
            <span className="text-[20px]">{intentLabel(data.intent)}</span>
          </span>
          <SelectChevronIcon size={18} />
        </div>
        <div className="flex min-w-[280px] flex-1 items-center justify-between bg-[#5f636b] px-4 py-3 text-white">
          <span>
            <span className="block text-[14px] opacity-80">Date Range</span>
            <span className="text-[20px]">{range}</span>
          </span>
          <SelectChevronIcon size={18} />
        </div>
        <div className="flex min-w-[280px] flex-1 items-center justify-between bg-[#5f636b] px-4 py-3 text-white">
          <span>
            <span className="block text-[14px] opacity-80">Rows</span>
            <span className="text-[20px]">{allRows.length}</span>
          </span>
          <SelectChevronIcon size={18} />
        </div>
      </div>

      {data.title && (
        <p className="mt-4 text-[16px] text-neutral-700">{data.title}</p>
      )}

      <div className="mt-4 flex items-stretch gap-px border border-neutral-300">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search for anything"
          className="flex-1 px-4 py-3 text-[16px] outline-none placeholder:text-neutral-400"
        />
      </div>

      <div className="mt-4 flex items-center justify-between print:hidden">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() =>
              downloadCsv(
                `orithos-ai-report-${data.id}.csv`,
                columns,
                rows,
              )
            }
            className="flex cursor-pointer items-center gap-2 rounded-md border border-[#5cb3e0] px-5 py-2.5 font-semibold text-[var(--sf-tab-blue)]"
          >
            <ExportIcon size={18} /> Export
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-[#5cb3e0] px-5 py-2.5 font-semibold text-[var(--sf-tab-blue)]"
          >
            <PrinterIcon size={18} /> Print
          </button>
          <button
            type="button"
            disabled
            className="flex items-center gap-2 rounded-md border border-neutral-200 px-5 py-2.5 font-semibold text-neutral-400"
          >
            <SaveIcon size={18} /> Save
          </button>
        </div>
        <button
          type="button"
          disabled
          className="flex items-center gap-2 rounded-md border border-neutral-200 px-5 py-2.5 font-semibold text-neutral-400"
        >
          <ColumnsIcon size={18} /> Columns
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="overflow-hidden rounded-md">
        <table aria-label="AI report results" className="w-full table-fixed border-collapse font-sans text-[13px]">
          <thead>
            <tr className="bg-black text-[13px] font-bold text-white">
              {columns.map((col, i) => (
                <th key={col} scope="col" className="px-2 py-2 text-center">
                  <span className="inline-flex items-center justify-center gap-1">
                    {formatReportColumnHeader(col)}
                    {i > 0 && <SortArrowsIcon size={12} className="shrink-0 opacity-70" />}
                  </span>
                </th>
              ))}
            </tr>
            <tr className="bg-[var(--oh-primary)] text-[13px] font-bold text-white">
              {totals.map((t, i) => (
                <td key={columns[i] ?? i} className="px-2 py-2 text-center">
                  {t ?? ""}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(columns.length, 1)}
                  className="px-3 py-8 text-center text-[13px] text-neutral-500"
                >
                  No matching rows.
                </td>
              </tr>
            ) : (
              rows.map((row, ri) => (
                <tr
                  key={ri}
                  className={ri % 2 === 0 ? "bg-white" : "bg-[#f3f3f3]"}
                >
                  {columns.map((col) => (
                    <td key={col} className="px-2 py-2 text-center text-[13px] text-black">
                      {cellText(row[col])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
