"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Download,
  Printer,
  Save,
  Search,
  ShoppingBag,
} from "lucide-react";
import { ReportColumnChooser } from "@/components/admin/ReportColumnChooser";
import { ReportPeriodToolbar } from "@/components/reports/ReportPeriodToolbar";
import { reportMoney, reportNumber } from "@/components/reports/report-format";
import { fetchOrithosApi } from "@/lib/orithos-api-fetch";
import {
  DEFAULT_PURCHASE_COLUMNS,
  PURCHASE_REPORT_COLUMNS,
  PURCHASE_REPORT_TYPES,
  filterPurchaseRows,
  isPurchaseGroupBy,
  purchaseFooterTotals,
  purchaseReportTypeLabel,
  sortPurchaseRows,
  type PurchaseColumnKey,
  type PurchaseGroupBy,
  type PurchaseReportRow,
  type PurchaseSort,
  type PurchaseSortDirection,
} from "@/lib/purchase-report";
import {
  readReportRangeFromSearch,
  reportDatePreset,
  syncReportRangeToUrl,
  type ReportDatePreset,
} from "@/lib/report-date-selection";

type PurchaseReport = {
  source: "orithos_ledger";
  from: string;
  to: string;
  groupBy: PurchaseGroupBy;
  rows: PurchaseReportRow[];
  totals: {
    orderCount: number;
    totalCost: number;
    fees: number | null;
    freight: number | null;
    paymentFees: number | null;
    taxAmount: number | null;
  };
  feesAvailable: boolean;
  freightAvailable: boolean;
  paymentFeesAvailable: boolean;
  taxAvailable: boolean;
  diagnostics?: {
    available?: boolean;
    mirrorPurchaseOrders?: number;
    mappedPurchaseOrders?: number;
    nativePurchaseOrders?: number;
    nativeReportOrders?: number;
    message?: string;
  };
  parityNotes?: string[];
};

const PREFS_KEY = "orithos.purchase-report.v1";

type SavedPrefs = {
  columns?: string[];
  groupBy?: PurchaseGroupBy;
};

function moneyOrDash(value: number | null | undefined, available: boolean) {
  if (!available || value == null || !Number.isFinite(Number(value))) return "—";
  return reportMoney(Number(value));
}

function csvEscape(value: string) {
  return /["\n,]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function loadPrefs(): SavedPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedPrefs;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function cellValue(row: PurchaseReportRow, key: PurchaseColumnKey): string {
  switch (key) {
    case "name":
      return row.name;
    case "orderCount":
      return String(row.orderCount);
    case "totalCost":
      return row.totalCost.toFixed(2);
    case "fees":
      return row.feesAvailable && row.fees != null ? row.fees.toFixed(2) : "";
    case "freight":
      return row.freightAvailable && row.freight != null ? row.freight.toFixed(2) : "";
    case "paymentFees":
      return row.paymentFeesAvailable && row.paymentFees != null ? row.paymentFees.toFixed(2) : "";
    case "taxAmount":
      return row.taxAvailable && row.taxAmount != null ? row.taxAmount.toFixed(2) : "";
    default:
      return "";
  }
}

function displayCell(row: PurchaseReportRow, key: PurchaseColumnKey) {
  switch (key) {
    case "name":
      return row.name;
    case "orderCount":
      return reportNumber(row.orderCount);
    case "totalCost":
      return reportMoney(row.totalCost);
    case "fees":
      return moneyOrDash(row.fees, row.feesAvailable);
    case "freight":
      return moneyOrDash(row.freight, row.freightAvailable);
    case "paymentFees":
      return moneyOrDash(row.paymentFees, row.paymentFeesAvailable);
    case "taxAmount":
      return moneyOrDash(row.taxAmount, row.taxAvailable);
    default:
      return "—";
  }
}

function footerCell(
  totals: ReturnType<typeof purchaseFooterTotals>,
  key: PurchaseColumnKey,
  flags: Pick<PurchaseReport, "feesAvailable" | "freightAvailable" | "paymentFeesAvailable" | "taxAvailable">,
) {
  switch (key) {
    case "name":
      return "Total";
    case "orderCount":
      return reportNumber(totals.orderCount);
    case "totalCost":
      return reportMoney(totals.totalCost);
    case "fees":
      return moneyOrDash(totals.fees, flags.feesAvailable || totals.fees != null);
    case "freight":
      return moneyOrDash(totals.freight, flags.freightAvailable || totals.freight != null);
    case "paymentFees":
      return moneyOrDash(totals.paymentFees, flags.paymentFeesAvailable || totals.paymentFees != null);
    case "taxAmount":
      return moneyOrDash(totals.taxAmount, flags.taxAvailable || totals.taxAmount != null);
    default:
      return "—";
  }
}

export function NativePurchaseReportPage() {
  const defaults = useMemo(() => reportDatePreset("today"), []);
  const initialPrefs = useMemo(() => loadPrefs(), []);
  const [period, setPeriod] = useState<ReportDatePreset>("today");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [groupBy, setGroupBy] = useState<PurchaseGroupBy>(
    isPurchaseGroupBy(initialPrefs.groupBy) ? initialPrefs.groupBy : "outlet",
  );
  const [columns, setColumns] = useState<PurchaseColumnKey[]>(() => {
    const saved = (initialPrefs.columns ?? []).filter((key): key is PurchaseColumnKey =>
      PURCHASE_REPORT_COLUMNS.some((column) => column.key === key),
    );
    return saved.length > 0 ? saved : DEFAULT_PURCHASE_COLUMNS;
  });
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<PurchaseSort>("totalCost");
  const [sortDirection, setSortDirection] = useState<PurchaseSortDirection>("desc");
  const [rangeReady, setRangeReady] = useState(false);
  const [report, setReport] = useState<PurchaseReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    const selection = readReportRangeFromSearch(window.location.search);
    setPeriod(selection.period);
    setFrom(selection.from);
    setTo(selection.to);
    const params = new URLSearchParams(window.location.search);
    const requestedGroup = params.get("groupBy");
    if (isPurchaseGroupBy(requestedGroup)) setGroupBy(requestedGroup);
    syncReportRangeToUrl(selection.period, selection.from, selection.to);
    setRangeReady(true);
  }, []);

  useEffect(() => {
    if (!rangeReady) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      setReport(null);
      setError("Choose a valid date range.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from, to, groupBy });
    const url = new URL(window.location.href);
    url.searchParams.set("groupBy", groupBy);
    window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
    fetchOrithosApi(`/reports/purchase?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { data?: PurchaseReport; message?: string } | null;
        if (!response.ok || !body?.data || body.data.source !== "orithos_ledger") {
          throw new Error(body?.message || "Orithos purchase data is unavailable.");
        }
        setReport(body.data);
        setError(null);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setReport(null);
          setError(cause instanceof Error ? cause.message : "Orithos purchase data is unavailable.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [from, to, groupBy, revision, rangeReady]);

  const visibleColumns = useMemo(
    () => PURCHASE_REPORT_COLUMNS.filter((column) => columns.includes(column.key)),
    [columns],
  );

  const displayed = useMemo(() => {
    const rows = filterPurchaseRows(report?.rows ?? [], query);
    return sortPurchaseRows(rows, sortBy, sortDirection);
  }, [report?.rows, query, sortBy, sortDirection]);

  const footerTotals = useMemo(() => purchaseFooterTotals(displayed), [displayed]);
  const diagnostics = report?.diagnostics;

  function toggleColumn(key: string) {
    setColumns((current) => {
      if (current.includes(key as PurchaseColumnKey)) {
        if (key === "name" || current.length <= 1) return current;
        return current.filter((column) => column !== key);
      }
      return PURCHASE_REPORT_COLUMNS.map((column) => column.key).filter(
        (column) => current.includes(column) || column === key,
      );
    });
  }

  function toggleSort(column: PurchaseSort) {
    if (sortBy === column) {
      setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(column);
    setSortDirection(column === "name" ? "asc" : "desc");
  }

  function savePrefs() {
    const payload: SavedPrefs = { columns, groupBy };
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(payload));
    setSaveNotice("Report layout saved on this device.");
    window.setTimeout(() => setSaveNotice(null), 2400);
  }

  function exportCsv() {
    const header = visibleColumns.map((column) => column.label).join(",");
    const body = displayed
      .map((row) => visibleColumns.map((column) => csvEscape(cellValue(row, column.key))).join(","))
      .join("\n");
    const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `purchase-report-${from}-${to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function sortIcon(column: PurchaseSort) {
    if (sortBy !== column) return <ArrowUpDown size={12} className="opacity-60" aria-hidden="true" />;
    return sortDirection === "asc"
      ? <ArrowUp size={12} aria-hidden="true" />
      : <ArrowDown size={12} aria-hidden="true" />;
  }

  function cellAlign(key: PurchaseColumnKey) {
    return key === "name" ? "text-left" : "text-right";
  }

  const toolBtn =
    "inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50";
  const filterBtn =
    "relative flex min-h-10 min-w-[10.5rem] flex-1 cursor-pointer items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)] transition-colors hover:border-[var(--oh-primary)]/40 focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15 sm:flex-none";

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--oh-surface)]">
      <header className="shrink-0 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-3 md:px-6">
          <div>
            <p className="text-xs font-medium text-[var(--oh-muted)]">Orithos ledger · Australia/Adelaide</p>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--oh-text)]">Purchase report</h1>
            <p className="mt-0.5 text-sm text-[var(--oh-muted)]">
              Received purchase spend by order date · {from === to ? from : `${from} → ${to}`}
            </p>
          </div>
          <dl className="flex flex-wrap items-stretch gap-2 text-sm">
            <div className="min-w-[6.5rem] rounded-lg border border-[var(--oh-border)] bg-white px-3 py-1.5">
              <dt className="text-[11px] font-medium text-[var(--oh-muted)]">Rows</dt>
              <dd className="tabular-nums font-semibold text-[var(--oh-text)]">
                {loading && !report ? "…" : reportNumber(displayed.length)}
              </dd>
            </div>
            <div className="min-w-[6.5rem] rounded-lg border border-[var(--oh-border)] bg-white px-3 py-1.5">
              <dt className="text-[11px] font-medium text-[var(--oh-muted)]">Orders</dt>
              <dd className="tabular-nums font-semibold text-[var(--oh-text)]">
                {loading && !report ? "…" : reportNumber(footerTotals.orderCount)}
              </dd>
            </div>
            <div className="min-w-[7.5rem] rounded-lg border border-[var(--oh-border)] bg-[var(--oh-orange-light)] px-3 py-1.5">
              <dt className="text-[11px] font-medium text-[var(--oh-muted)]">Total cost</dt>
              <dd className="tabular-nums font-semibold text-[var(--oh-text)]">
                {loading && !report ? "…" : reportMoney(footerTotals.totalCost)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--oh-border)] px-4 py-3 md:px-6">
          <label className={filterBtn}>
            <span className="shrink-0 text-[11px] font-medium text-[var(--oh-muted)]">Type</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{purchaseReportTypeLabel(groupBy)}</span>
            <ChevronDown size={15} className="shrink-0 text-[var(--oh-primary)]" aria-hidden="true" />
            <select
              aria-label="Report Type"
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value as PurchaseGroupBy)}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {PURCHASE_REPORT_TYPES.map((entry) => (
                <option key={entry.value} value={entry.value}>{entry.label}</option>
              ))}
            </select>
          </label>

          <ReportPeriodToolbar
            period={period}
            from={from}
            to={to}
            loading={loading}
            onChange={(next) => {
              setPeriod(next.period);
              setFrom(next.from);
              setTo(next.to);
            }}
            onRefresh={() => setRevision((value) => value + 1)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-3 md:px-6">
          <label className="flex min-h-10 min-w-[12rem] flex-1 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 transition-colors focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15">
            <Search size={16} className="shrink-0 text-[var(--oh-muted)]" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search for anything"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={loading || !report} onClick={exportCsv} className={toolBtn}>
              <Download size={15} aria-hidden="true" /> Export
            </button>
            <button type="button" onClick={() => window.print()} className={toolBtn} aria-label="Print">
              <Printer size={15} aria-hidden="true" />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button type="button" onClick={savePrefs} className={toolBtn} aria-label="Save layout">
              <Save size={15} aria-hidden="true" />
              <span className="hidden sm:inline">Save</span>
            </button>
            <ReportColumnChooser
              columns={[...PURCHASE_REPORT_COLUMNS]}
              selected={columns}
              required={["name"]}
              onChange={toggleColumn}
            />
          </div>
        </div>
      </header>

      {(saveNotice || error) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-2.5 text-sm md:px-6">
          {saveNotice && <p className="text-emerald-800">{saveNotice}</p>}
          {error && (
            <div role="alert" className="flex items-center gap-2 text-red-800">
              <AlertCircle size={16} />
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setRevision((value) => value + 1)}
                className="min-h-9 rounded-md border border-red-300 px-3 font-semibold"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto bg-[var(--oh-surface-elevated)]">
        {loading && !report ? (
          <p role="status" className="py-16 text-center text-sm text-[var(--oh-muted)]">Loading purchase report…</p>
        ) : error && !report ? null : displayed.length === 0 ? (
          <div className="grid place-items-center py-16 text-center text-[var(--oh-muted)]">
            <ShoppingBag size={24} aria-hidden="true" />
            <p className="mt-2 text-sm">No received purchase orders in this date range.</p>
          </div>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-[var(--oh-border-strong)] bg-[var(--oh-surface-elevated)]/95 backdrop-blur-sm">
              <tr>
                {visibleColumns.map((column) => {
                  const active = sortBy === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      className={`whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-[var(--oh-muted)] ${cellAlign(column.key)}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className={`inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:text-[var(--oh-text)] ${
                          active ? "text-[var(--oh-primary)]" : "text-[var(--oh-muted)]"
                        }`}
                      >
                        {column.label}
                        {sortIcon(column.key)}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayed.map((row) => (
                <tr
                  key={`${row.id ?? "row"}-${row.name}`}
                  className="border-b border-[var(--oh-border)] transition-colors hover:bg-[var(--oh-surface-muted)]"
                >
                  {visibleColumns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-2.5 tabular-nums ${cellAlign(column.key)} ${
                        column.key === "name" ? "font-medium text-[var(--oh-text)]" : "text-[var(--oh-text)]"
                      }`}
                    >
                      {displayCell(row, column.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {report ? (
              <tfoot
                className="sticky bottom-0 z-10 border-t-2 border-[var(--oh-border-strong)] bg-[var(--oh-surface-muted)] font-semibold text-[var(--oh-text)]"
                aria-label="Purchase report totals"
              >
                <tr>
                  {visibleColumns.map((column) => (
                    <td key={column.key} className={`px-4 py-3 text-sm tabular-nums ${cellAlign(column.key)}`}>
                      {footerCell(footerTotals, column.key, report)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        )}

        <div className="space-y-2 px-4 py-4 text-xs text-[var(--oh-muted)] md:px-6">
          <p>
            Native ledger purchase report. Includes received and partially received orders (type ORDER) by order date.
            Fees, freight, payment fees, and tax show as unavailable until those fields are stored on imported lines.
            This page is not the Purchases order workflow, and does not proxy Shopfront /reports/purchase.
          </p>
          {diagnostics?.available ? (
            <p>
              Sync diagnostics: mirror {reportNumber(diagnostics.mirrorPurchaseOrders ?? 0)} · mapped{" "}
              {reportNumber(diagnostics.mappedPurchaseOrders ?? 0)} · native{" "}
              {reportNumber(diagnostics.nativePurchaseOrders ?? 0)} · in range{" "}
              {reportNumber(diagnostics.nativeReportOrders ?? 0)}. Unmapped mirror orders are excluded from totals.
            </p>
          ) : diagnostics?.message ? (
            <p>{diagnostics.message}</p>
          ) : null}
          {report?.parityNotes?.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      </div>
    </main>
  );
}
