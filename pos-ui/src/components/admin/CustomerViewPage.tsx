"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi, useApiList, useRecentCustomerSales, type CustomerRecentSaleLine } from "@/hooks/useApi";
import { AsyncState } from "@/components/admin/AsyncState";
import { ListTable } from "@/components/admin/ListTable";
import { Modal } from "@/components/admin/Modal";
import { AlertDialog } from "@/components/admin/AlertDialog";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { CustomerMakePaymentModal } from "@/components/admin/CustomerMakePaymentModal";
import type { CustomerDetail } from "@/components/admin/CreateCustomerPage";
import {
  BookOpenIcon,
  ClockIcon,
  DeleteIcon,
  DollarSignIcon,
  EditIcon,
  ArrowLeftIcon,
  HomeIcon,
  PrinterIcon,
  ScaleIcon,
  StatementIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

interface Sale {
  id: string;
  invoiceId?: string;
  status?: string;
  totalPrice?: number | null;
  outstanding?: number | null;
  createdAt?: string;
  userName?: string;
}

interface CustomerPayment {
  id: string;
  amount?: number | null;
  status?: string;
  reference?: string;
  timestamp?: string;
  startBalance?: number | null;
  paymentMethodName?: string;
  userName?: string;
}

interface CustomerRevision {
  id: string;
  action?: string;
  summary?: string;
  userName?: string;
  createdAt?: string;
}

type NavId = "home" | "balance" | "sales-history" | "revision-history";

const NAV: { id: NavId; label: string; description: string; Icon: typeof HomeIcon }[] = [
  {
    id: "home",
    label: "Home",
    description: "View customer details and recent items purchased",
    Icon: HomeIcon,
  },
  {
    id: "balance",
    label: "Balance & Payments",
    description: "Make payments, see outstanding invoices and run statements",
    Icon: ScaleIcon,
  },
  {
    id: "sales-history",
    label: "Sales History",
    description: "View all sales for this customer",
    Icon: BookOpenIcon,
  },
  {
    id: "revision-history",
    label: "Revision History",
    description: "Check the recent changes made to this customer",
    Icon: ClockIcon,
  },
];

function money(x?: number | null) {
  if (x === null || x === undefined) return "—";
  return `$${Number(x).toFixed(2)}`;
}

function display(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function formatTimestamp(ts?: string) {
  if (!ts) return "—";
  const [datePart = "", timePartRaw = ""] = ts.split("T");
  const time = timePartRaw.slice(0, 8);
  const [y, m, d] = datePart.split("-");
  const date = y && m && d ? `${d}/${m}/${y}` : datePart;
  return time ? `${date} ${time}` : date;
}

function availableCredit(customer: CustomerDetail) {
  const limit = Number(customer.accountLimit ?? 0);
  const owing = Number(customer.currentOwing ?? 0);
  if (!customer.accountLimit) return null;
  return Math.max(limit - owing, 0);
}

function CustomerHomePanel({
  customer,
  recentSales,
  loading,
  error,
  onRetry,
}: {
  customer: CustomerDetail;
  recentSales: CustomerRecentSaleLine[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const email = customer.email ?? customer.emails?.[0];

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-[13px] font-semibold text-[var(--oh-text)]">Email</p>
          <p className="mt-1 break-words text-[15px] text-[var(--oh-text-secondary)]">{display(email)}</p>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-[var(--oh-text)]">Phone</p>
          <p className="mt-1 text-[15px] text-[var(--oh-text-secondary)]">{display(customer.phone ?? customer.mobile)}</p>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-[var(--oh-text)]">Customer Group</p>
          <p className="mt-1 text-[15px] text-[var(--oh-text-secondary)]">
            {display(customer.customerGroupName)}
          </p>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-[var(--oh-text)]">Customer Code</p>
          <p className="mt-1 text-[15px] text-[var(--oh-text-secondary)]">{display(customer.code)}</p>
        </div>
      </div>

      <div>
        <p className="mb-3 text-[13px] font-semibold text-[var(--oh-text)]">Last 10 Sales</p>
        <AsyncState
          loading={loading}
          error={error}
          empty={recentSales.length === 0}
          emptyText="No sales recorded for this customer yet."
          onRetry={onRetry}
        >
          <ListTable
            columns={[
              { label: "Timestamp", width: "w-[180px]" },
              { label: "User", width: "w-[140px]" },
              { label: "Quantity", align: "right", width: "w-[90px]" },
              { label: "Item" },
              { label: "Price", align: "right", width: "w-[100px]" },
            ]}
            rows={recentSales.map((line) => [
              formatTimestamp(line.timestamp),
              display(line.userName),
              line.quantity ?? "—",
              display(line.item),
              money(line.price),
            ])}
          />
        </AsyncState>
      </div>
    </div>
  );
}

function CustomerStatementModal({
  customer,
  payments,
  sales,
  onClose,
}: {
  customer: CustomerDetail;
  payments: CustomerPayment[];
  sales: Sale[];
  onClose: () => void;
}) {
  const rows = [
    ...sales.map((s) => ({
      key: `sale-${s.id}`,
      date: s.createdAt,
      label: `Sale ${s.invoiceId ?? s.id}`,
      amount: Number(s.totalPrice ?? 0),
      type: "charge" as const,
    })),
    ...payments
      .filter((p) => p.status !== "VOIDED")
      .map((p) => ({
        key: `pay-${p.id}`,
        date: p.timestamp,
        label: p.reference ? `Payment (${p.reference})` : "Payment",
        amount: Number(p.amount ?? 0),
        type: "payment" as const,
      })),
  ].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

  return (
    <Modal title="Customer Statement" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4">
          <p className="text-[16px] font-semibold text-[var(--oh-text)]">{customer.name}</p>
          <p className="mt-1 text-[13px] text-[var(--oh-muted)]">Statement as of {formatTimestamp(new Date().toISOString())}</p>
          <p className="mt-3 text-[22px] font-semibold text-[var(--oh-text)]">
            Balance: {money(customer.currentOwing)}
          </p>
        </div>

        <ListTable
          columns={[
            { label: "Date", width: "w-[160px]" },
            { label: "Description" },
            { label: "Amount", align: "right", width: "w-[100px]" },
          ]}
          rows={rows.map((row) => [
            formatTimestamp(row.date),
            row.label,
            row.type === "payment" ? `-${money(row.amount)}` : money(row.amount),
          ])}
        />
      </div>
    </Modal>
  );
}

function CustomerBalancePanel({
  customer,
  payments,
  outstandingSales,
  paymentsLoading,
  salesLoading,
  paymentsError,
  salesError,
  onRetryPayments,
  onRetrySales,
  onMakePayment,
  onViewStatement,
  onVoidPayment,
}: {
  customer: CustomerDetail;
  payments: CustomerPayment[];
  outstandingSales: Sale[];
  paymentsLoading: boolean;
  salesLoading: boolean;
  paymentsError: string | null;
  salesError: string | null;
  onRetryPayments: () => void;
  onRetrySales: () => void;
  onMakePayment: () => void;
  onViewStatement: () => void;
  onVoidPayment: (paymentId: string) => void;
}) {
  const credit = availableCredit(customer);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)]">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
            Current Owing
          </p>
          <p className="mt-1 text-[22px] font-semibold text-[var(--oh-text)]">
            {money(customer.currentOwing)}
          </p>
        </div>
        <div className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)]">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
            Account Limit
          </p>
          <p className="mt-1 text-[22px] font-semibold text-[var(--oh-text)]">
            {money(customer.accountLimit)}
          </p>
        </div>
        <div className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)]">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
            Available Credit
          </p>
          <p className="mt-1 text-[22px] font-semibold text-[var(--oh-text)]">
            {credit === null ? "—" : money(credit)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
        <button
          type="button"
          onClick={onMakePayment}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[var(--oh-radius)] bg-[var(--oh-primary)] px-4 py-2.5 text-[13px] font-semibold text-white outline-none transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] focus-visible:ring-offset-2 sm:flex-none"
        >
          <DollarSignIcon size={16} />
          Make Payment
        </button>
        <button
          type="button"
          onClick={onViewStatement}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-2.5 text-[13px] font-semibold text-[var(--oh-text)] outline-none transition-colors hover:bg-[var(--oh-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] focus-visible:ring-offset-2 sm:flex-none"
        >
          <StatementIcon size={16} />
          View Statement
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-2.5 text-[13px] font-semibold text-[var(--oh-text)] outline-none transition-colors hover:bg-[var(--oh-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] focus-visible:ring-offset-2 sm:flex-none"
        >
          <PrinterIcon size={16} />
          Print
        </button>
      </div>

      <div>
        <p className="mb-3 text-[13px] font-semibold text-[var(--oh-text)]">Outstanding Invoices</p>
        <AsyncState
          loading={salesLoading}
          error={salesError}
          empty={outstandingSales.length === 0}
          emptyText="No outstanding invoices for this customer."
          onRetry={onRetrySales}
        >
          <ListTable
            columns={[
              { label: "Invoice", width: "w-[140px]" },
              { label: "Date", width: "w-[180px]" },
              { label: "Total", align: "right", width: "w-[100px]" },
              { label: "Outstanding", align: "right", width: "w-[110px]" },
            ]}
            rows={outstandingSales.map((s) => [
              s.invoiceId ?? "—",
              formatTimestamp(s.createdAt),
              money(s.totalPrice),
              money(s.outstanding),
            ])}
          />
        </AsyncState>
      </div>

      <div>
        <p className="mb-3 text-[13px] font-semibold text-[var(--oh-text)]">Payment History</p>
        <AsyncState
          loading={paymentsLoading}
          error={paymentsError}
          empty={payments.length === 0}
          emptyText="No payments recorded for this customer yet."
          onRetry={onRetryPayments}
        >
          <ListTable
            columns={[
              { label: "Date", width: "w-[180px]" },
              { label: "Method", width: "w-[120px]" },
              { label: "Reference" },
              { label: "User", width: "w-[120px]" },
              { label: "Status", width: "w-[100px]" },
              { label: "Amount", align: "right", width: "w-[100px]" },
              { label: "Actions", align: "center", width: "w-[90px]" },
            ]}
            rows={payments.map((p) => [
              formatTimestamp(p.timestamp),
              display(p.paymentMethodName),
              display(p.reference),
              display(p.userName),
              display(p.status),
              money(p.amount),
              p.status === "COMPLETED" ? (
                <button
                  key={`void-${p.id}`}
                  type="button"
                  onClick={() => onVoidPayment(p.id)}
                  className="inline-flex min-h-11 items-center justify-center rounded-md px-2 text-[13px] font-semibold text-[var(--oh-danger)] outline-none hover:bg-[var(--oh-tile-red-bg)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--oh-danger)]"
                >
                  Void
                </button>
              ) : (
                "—"
              ),
            ])}
          />
        </AsyncState>
      </div>
    </div>
  );
}

function CustomerRevisionPanel({
  revisions,
  loading,
  error,
  onRetry,
}: {
  revisions: CustomerRevision[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <AsyncState
      loading={loading}
      error={error}
      empty={revisions.length === 0}
      emptyText="No revision history recorded for this customer yet."
      onRetry={onRetry}
    >
      <ListTable
        columns={[
          { label: "Date", width: "w-[180px]" },
          { label: "User", width: "w-[140px]" },
          { label: "Action", width: "w-[120px]" },
          { label: "Details" },
        ]}
        rows={revisions.map((r) => [
          formatTimestamp(r.createdAt),
          display(r.userName),
          display(r.action),
          display(r.summary),
        ])}
      />
    </AsyncState>
  );
}

export function CustomerViewPage({ customerId, onClose }: { customerId: string; onClose?: () => void }) {
  const router = useRouter();
  const [nav, setNav] = useState<NavId>("home");
  const [deleting, setDeleting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [voidPaymentId, setVoidPaymentId] = useState<string | null>(null);
  const [voidingPayment, setVoidingPayment] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: customer, loading, error, reload: reloadCustomer } = useApi<CustomerDetail>(
    customerId ? `/api/customers/${customerId}` : null,
  );

  const recentSales = useRecentCustomerSales(customerId, nav === "home");

  const sales = useApiList<Sale>(
    nav === "sales-history" || nav === "balance" || statementOpen ? "/api/sales" : null,
    { customerId, page: 1, size: 50 },
  );

  const payments = useApiList<CustomerPayment>(
    nav === "balance" || statementOpen ? "/api/customer-payments" : null,
    { customerId, page: 1, size: 50 },
  );

  const revisions = useApiList<CustomerRevision>(
    nav === "revision-history" ? `/api/customers/${customerId}/revisions` : null,
    { page: 1, size: 50 },
  );

  const outstandingSales = sales.items.filter((s) => Number(s.outstanding ?? 0) > 0);

  async function handleDelete() {
    setDeleting(true);
    setActionError(null);
    try {
      await api.del(`/api/customers/${customerId}`);
      if (onClose) onClose();
      else router.push("/customers");
    } catch (e) {
      setDeleteConfirmOpen(false);
      setActionError(e instanceof Error ? e.message : "Failed to delete customer");
      setDeleting(false);
    }
  }

  async function handleVoidPayment(paymentId: string) {
    setVoidingPayment(true);
    setActionError(null);
    try {
      await api.put(`/api/customer-payments/${paymentId}/void`);
      reloadCustomer();
      payments.reload();
      sales.reload();
      revisions.reload();
      setVoidPaymentId(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to void payment");
    } finally {
      setVoidingPayment(false);
    }
  }

  function handlePaid() {
    reloadCustomer();
    payments.reload();
    sales.reload();
    revisions.reload();
  }

  const title = customer?.name || customer?.firstName || "Customer";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--oh-surface)] font-sans">
      <div className="relative flex shrink-0 items-center gap-3 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2.5 text-left sm:px-6 md:justify-center md:text-center">
        <button type="button" onClick={onClose ?? (() => router.push("/customers"))} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-medium text-[var(--oh-text-secondary)] outline-none hover:bg-[var(--oh-surface)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] md:absolute md:left-4">
          <ArrowLeftIcon size={16} /> <span>Customers</span>
        </button>
        <h1 className="min-w-0 flex-1 break-words text-lg font-semibold leading-6 text-[var(--oh-text)] md:flex-none md:text-xl">
          {loading ? "Loading…" : title}
        </h1>
      </div>

      <AsyncState loading={loading} error={error} empty={false} onRetry={reloadCustomer}>
        {customer && (
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <main className="order-last min-h-0 min-w-0 flex-1 overflow-auto p-4 sm:p-6 lg:order-first">
              {nav === "home" && (
                <CustomerHomePanel
                  customer={customer}
                  recentSales={recentSales.data}
                  loading={recentSales.loading}
                  error={recentSales.error}
                  onRetry={recentSales.reload}
                />
              )}
              {nav === "balance" && (
                <CustomerBalancePanel
                  customer={customer}
                  payments={payments.items}
                  outstandingSales={outstandingSales}
                  paymentsLoading={payments.loading}
                  salesLoading={sales.loading}
                  paymentsError={payments.error}
                  salesError={sales.error}
                  onRetryPayments={payments.reload}
                  onRetrySales={sales.reload}
                  onMakePayment={() => setPaying(true)}
                  onViewStatement={() => setStatementOpen(true)}
                  onVoidPayment={(paymentId) => setVoidPaymentId(paymentId)}
                />
              )}
              {nav === "sales-history" && (
                <AsyncState
                  loading={sales.loading}
                  error={sales.error}
                  empty={sales.items.length === 0}
                  emptyText="No sales recorded for this customer yet."
                  onRetry={sales.reload}
                >
                  <ListTable
                    columns={[
                      { label: "Invoice", width: "w-[140px]" },
                      { label: "Date", width: "w-[180px]" },
                      { label: "User", width: "w-[140px]" },
                      { label: "Status", width: "w-[100px]" },
                      { label: "Total", align: "right", width: "w-[100px]" },
                      { label: "Outstanding", align: "right", width: "w-[110px]" },
                    ]}
                    rows={sales.items.map((s) => [
                      s.invoiceId ?? "—",
                      formatTimestamp(s.createdAt),
                      display(s.userName),
                      display(s.status),
                      money(s.totalPrice),
                      money(s.outstanding),
                    ])}
                  />
                </AsyncState>
              )}
              {nav === "revision-history" && (
                <CustomerRevisionPanel
                  revisions={revisions.items}
                  loading={revisions.loading}
                  error={revisions.error}
                  onRetry={revisions.reload}
                />
              )}
            </main>

            <aside className="order-first flex w-full shrink-0 flex-col border-b border-[var(--oh-border)] bg-[var(--oh-surface)] lg:order-last lg:w-[280px] lg:border-b-0 lg:border-l">
              <div className="grid grid-cols-2 gap-2 p-3 lg:grid-cols-1 lg:p-4">
                <button
                  type="button"
                  onClick={() => router.push(`/customers/${customerId}/edit`)}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--oh-radius)] bg-[var(--oh-primary)] px-4 py-2.5 text-[13px] font-semibold text-white outline-none transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] focus-visible:ring-offset-2"
                >
                  <EditIcon size={16} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={deleting}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--oh-radius)] border border-[var(--oh-danger)] bg-[var(--oh-surface-elevated)] px-4 py-2.5 text-[13px] font-semibold text-[var(--oh-danger)] outline-none transition-colors hover:bg-[var(--oh-tile-red-bg)] focus-visible:ring-2 focus-visible:ring-[var(--oh-danger)] focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  <DeleteIcon size={16} />
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>

              <nav aria-label="Customer sections" className="flex shrink-0 gap-1 overflow-x-auto px-2 pb-2 lg:flex-1 lg:flex-col lg:space-y-0.5 lg:px-3 lg:pb-3">
                {NAV.map(({ id, label, description, Icon }) => {
                  const active = nav === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setNav(id)}
                      aria-pressed={active}
                      className={cn(
                        "relative flex min-h-11 w-auto shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] lg:w-full lg:items-start lg:gap-2.5 lg:py-3",
                        active
                          ? "bg-[var(--oh-surface-elevated)] text-[var(--oh-primary)] shadow-sm"
                          : "text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface-muted)]",
                      )}
                    >
                      {active && (
                        <span className="absolute bottom-0 left-2 right-2 h-[3px] rounded-t bg-[var(--oh-primary)] lg:bottom-2 lg:left-0 lg:right-auto lg:top-2 lg:h-auto lg:w-[3px] lg:rounded-r lg:rounded-t-none" />
                      )}
                      <Icon
                        size={16}
                        className={cn("shrink-0 lg:mt-0.5", active && "text-[var(--oh-primary)]")}
                        strokeWidth={1.75}
                      />
                      <div className="min-w-0">
                        <div className={cn("whitespace-nowrap text-[13px] font-semibold lg:whitespace-normal", active && "text-[var(--oh-primary)]")}>
                          {label}
                        </div>
                        <div className="mt-0.5 hidden text-[13px] leading-snug text-[var(--oh-muted)] lg:block">
                          {description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </nav>

            </aside>
          </div>
        )}
      </AsyncState>

      {paying && customer && (
        <CustomerMakePaymentModal
          customerId={customerId}
          customerName={customer.name ?? title}
          currentOwing={Number(customer.currentOwing ?? 0)}
          onClose={() => setPaying(false)}
          onPaid={handlePaid}
        />
      )}

      {statementOpen && customer && (
        <CustomerStatementModal
          customer={customer}
          payments={payments.items}
          sales={sales.items}
          onClose={() => setStatementOpen(false)}
        />
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete customer"
        message="Are you sure you want to delete this customer?"
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void handleDelete()}
      />

      <ConfirmDialog
        open={voidPaymentId !== null}
        title="Void payment"
        message="Void this payment and restore the customer balance?"
        confirmLabel="Void payment"
        busy={voidingPayment}
        onCancel={() => {
          if (!voidingPayment) setVoidPaymentId(null);
        }}
        onConfirm={() => {
          if (voidPaymentId) void handleVoidPayment(voidPaymentId);
        }}
      />

      <AlertDialog
        open={actionError !== null}
        title="Action failed"
        message={actionError ?? ""}
        variant="danger"
        onClose={() => setActionError(null)}
      />
    </div>
  );
}
