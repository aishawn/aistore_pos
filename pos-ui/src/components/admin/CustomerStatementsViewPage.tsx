"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminPageLayout, AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { AsyncState } from "@/components/admin/AsyncState";
import { useApi } from "@/hooks/useApi";
import { PrinterIcon } from "@/components/icons";

interface StatementLine {
  occurredAt?: string;
  description?: string;
  amount?: number | null;
  lineType?: string;
}

interface CustomerStatement {
  customerId?: string | number;
  customerName?: string;
  company?: string;
  openingBalance?: number | null;
  closingBalance?: number | null;
  currentOwing?: number | null;
  lines?: StatementLine[];
}

interface StatementsPreview {
  template?: { id?: string | number; name?: string };
  startDate?: string;
  endDate?: string;
  statements?: CustomerStatement[];
}

function money(x?: number | null) {
  return `$${Number(x ?? 0).toFixed(2)}`;
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateRange(start?: string, end?: string) {
  if (!start || !end) return "";
  return `${formatDate(start)} — ${formatDate(end)}`;
}

function formatTimestamp(ts?: string) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Printable preview of customer statements for a date range. */
export function CustomerStatementsViewPage() {
  const router = useRouter();
  const params = useSearchParams();

  const start = params.get("start") ?? "";
  const end = params.get("end") ?? "";
  const templateId = params.get("templateId") ?? "";
  const customerId = params.get("customerId") ?? undefined;
  const name = params.get("name") ?? undefined;
  const groupIds = params.get("groupIds") ?? undefined;

  const query = useMemo(
    () =>
      start && end && templateId
        ? { start, end, templateId, customerId, name, groupIds }
        : null,
    [start, end, templateId, customerId, name, groupIds],
  );

  const { data, loading, error } = useApi<StatementsPreview>(
    query ? "/api/customers/statements/preview" : null,
    query ?? undefined,
  );

  const statements = data?.statements ?? [];
  const templateName = data?.template?.name ?? "Statement";
  const singleCustomer = customerId && statements.length === 1 ? statements[0] : null;
  const pageTitle = singleCustomer?.customerName
    ? `${singleCustomer.customerName} — Statement`
    : "Customer Statements";

  return (
    <AdminPageLayout
      title={pageTitle}
      subtitle={formatDateRange(data?.startDate, data?.endDate) || "Select a date range"}
      count={statements.length}
      actions={
        <div className="flex gap-2 print:hidden">
          <AdminSecondaryButton onClick={() => router.push("/customers/balances")}>
            Back to Balances
          </AdminSecondaryButton>
          <AdminSecondaryButton onClick={() => window.print()}>
            <PrinterIcon size={16} /> Print
          </AdminSecondaryButton>
        </div>
      }
    >
      {!query && (
        <p className="text-[14px] text-[var(--oh-text-secondary)]">
          Missing statement parameters. Go back to Customer Balances and choose View All Statements.
        </p>
      )}

      <AsyncState loading={loading} error={error} empty={!!query && statements.length === 0}>
        <div className="space-y-8">
          <div className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-5 py-4 print:hidden">
            <p className="text-[14px] text-[var(--oh-text-secondary)]">
              Template: <span className="font-medium text-[var(--oh-text)]">{templateName}</span>
            </p>
            <p className="mt-1 text-[14px] text-[var(--oh-text-secondary)]">
              Period: <span className="font-medium text-[var(--oh-text)]">{formatDateRange(data?.startDate, data?.endDate)}</span>
            </p>
          </div>

          {statements.map((statement, index) => (
            <section
              key={String(statement.customerId ?? index)}
              className="break-inside-avoid rounded-lg border border-[var(--oh-border)] bg-white p-6 print:rounded-none print:border-0 print:p-0 print:[break-after:page]"
            >
              <div className="border-b border-[var(--oh-border)] pb-4">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--oh-muted)] print:text-black">
                  {templateName}
                </p>
                <h2 className="mt-1 text-[20px] font-semibold text-[var(--oh-text)]">
                  {statement.customerName}
                </h2>
                {statement.company && (
                  <p className="mt-0.5 text-[14px] text-[var(--oh-text-secondary)]">{statement.company}</p>
                )}
                <p className="mt-2 text-[13px] text-[var(--oh-muted)]">
                  {formatDateRange(data?.startDate, data?.endDate)}
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Opening Balance</p>
                  <p className="mt-1 text-[18px] font-semibold text-[var(--oh-text)]">{money(statement.openingBalance)}</p>
                </div>
                <div>
                  <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Closing Balance</p>
                  <p className="mt-1 text-[18px] font-semibold text-[var(--oh-text)]">{money(statement.closingBalance)}</p>
                </div>
                <div>
                  <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Current Owing</p>
                  <p className="mt-1 text-[18px] font-semibold text-[var(--oh-text)]">{money(statement.currentOwing)}</p>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-lg border border-[var(--oh-border)] text-[14px]">
                <div className="grid grid-cols-[160px_1fr_120px] bg-[var(--oh-surface)] text-[12px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                  <div className="border-r border-[var(--oh-border)] px-4 py-3">Date</div>
                  <div className="border-r border-[var(--oh-border)] px-4 py-3">Description</div>
                  <div className="px-4 py-3 text-right">Amount</div>
                </div>
                {(statement.lines ?? []).length === 0 ? (
                  <div className="px-4 py-6 text-center text-[13px] text-[var(--oh-muted)]">
                    No activity in this period.
                  </div>
                ) : (
                  (statement.lines ?? []).map((line, lineIndex) => (
                    <div
                      key={`${line.occurredAt}-${line.description}-${lineIndex}`}
                      className="grid grid-cols-[160px_1fr_120px] border-t border-[var(--oh-border)]"
                    >
                      <div className="border-r border-[var(--oh-border)] px-4 py-3 text-[var(--oh-text-secondary)]">
                        {formatTimestamp(line.occurredAt)}
                      </div>
                      <div className="border-r border-[var(--oh-border)] px-4 py-3 text-[var(--oh-text)]">
                        {line.description}
                      </div>
                      <div className="px-4 py-3 text-right font-medium text-[var(--oh-text)]">
                        {line.lineType === "PAYMENT" ? `-${money(line.amount)}` : money(line.amount)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      </AsyncState>
    </AdminPageLayout>
  );
}
