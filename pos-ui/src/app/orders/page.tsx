"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ClipboardIcon,
  TransferIcon,
  TruckIcon,
  ReturnIcon,
  ReceiptIcon,
  CableIcon,
  ScanIcon,
  ViewIcon,
  EditIcon,
  MenuIcon,
  XIcon,
} from "@/components/icons";
import { LoaderCircle } from "lucide-react";
import {
  AdminPageLayout,
  AdminPrimaryButton,
  AdminSecondaryButton,
} from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { Pagination } from "@/components/admin/Pagination";
import {
  DEFAULT_ORDER_FILTERS,
  orderFiltersToQuery,
  OrdersFilterPanel,
  type OrderFilters,
} from "@/components/admin/OrdersFilterPanel";
import { useApiList } from "@/hooks/useApi";
import { formatAuDate } from "@/lib/au";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

interface Order {
  id: string;
  type: string;
  status: string;
  fromId: string;
  toId: string;
  fromName?: string;
  toName?: string;
  orderDate: string;
  dueDate: string;
  enteredAs: string;
  invoiceNumber: string;
  reference: string;
  totalCost: number;
  expectedTotal: number;
  lineCount: number;
  createdAt: string;
}

const ACTIONS = [
  { label: "Order Stock", Icon: ClipboardIcon, href: "/orders/new" },
  { label: "Transfer Stock", Icon: TransferIcon, href: "/orders/transfer/new" },
  { label: "Receive Stock", Icon: TruckIcon, href: "/orders/receive/new" },
  { label: "Scan Invoice", Icon: ScanIcon, href: "/invoices/scan" },
  { label: "Return Stock", Icon: ReturnIcon, href: "/orders/return/new" },
  { label: "Add Credit Note", Icon: ReceiptIcon, href: "/orders/credit/new" },
  { label: "Integrations", Icon: CableIcon, href: "/settings/integrations", secondary: true },
] as const;

const TYPE_ICONS: Record<string, typeof ClipboardIcon> = {
  ORDER: ClipboardIcon,
  TRANSFER: TransferIcon,
  RECEIVE: TruckIcon,
  RETURN: ReturnIcon,
  CREDIT: ReceiptIcon,
};

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-blue-50 text-blue-800 ring-blue-200",
  SENT: "bg-sky-50 text-sky-800 ring-sky-200",
  RECEIVED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-700 ring-slate-200",
  OUTSTANDING: "bg-amber-50 text-amber-800 ring-amber-200",
};

function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700 ring-slate-200"} ring-1 ring-inset`}
    >
      {status}
    </span>
  );
}

function OrderActions({
  orderId,
  onView,
  onEdit,
}: {
  orderId: string;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1 text-[13px] font-medium">
      <button
        type="button"
        onClick={() => onView(orderId)}
        className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-[var(--oh-primary)] hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]"
      >
        <ViewIcon size={14} /> View
      </button>
      <button
        type="button"
        onClick={() => onEdit(orderId)}
        className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-[var(--oh-success)] hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-[var(--oh-success)]"
      >
        <EditIcon size={14} /> Edit
      </button>
    </div>
  );
}

function hasNonDefaultFilters(filters: OrderFilters) {
  return (Object.keys(DEFAULT_ORDER_FILTERS) as Array<keyof OrderFilters>).some(
    (key) => filters[key] !== DEFAULT_ORDER_FILTERS[key],
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<OrderFilters>(DEFAULT_ORDER_FILTERS);
  const [appliedQuery, setAppliedQuery] = useState(orderFiltersToQuery(DEFAULT_ORDER_FILTERS));
  const [page, setPage] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { items, total, loading, error, reload } = useApiList<Order>("/api/orders", {
    ...appliedQuery,
    page,
    size: PAGE_SIZE,
  });

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function applyFilters() {
    setAppliedQuery(orderFiltersToQuery(filters));
    setPage(1);
    setMenuOpen(false);
  }

  const hasActiveFilters = hasNonDefaultFilters(filters);

  function clearFilters() {
    setFilters(DEFAULT_ORDER_FILTERS);
    setAppliedQuery(orderFiltersToQuery(DEFAULT_ORDER_FILTERS));
    setPage(1);
  }

  return (
    <AdminPageLayout
      title="Orders"
      subtitle="Manage stock orders, transfers, receipts and returns"
      compact
      count={loading || error ? undefined : total}
      countLabel="Orders"
      actions={
        <>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="dialog"
              aria-label="Orders actions and filters"
              className="relative flex min-h-11 items-center gap-2 rounded-[var(--oh-radius)] bg-[var(--oh-primary)] px-3 text-[13px] font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
            >
              {menuOpen ? <XIcon size={18} /> : <MenuIcon size={18} />}
              Menu
              {hasActiveFilters && !menuOpen && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[var(--oh-danger)] ring-2 ring-[var(--oh-surface)]" />
              )}
            </button>

            {menuOpen && (
              <div
                role="dialog"
                aria-label="Orders menu"
                className="absolute right-0 top-[calc(100%+8px)] z-30 max-h-[min(75vh,720px)] w-[min(1000px,calc(100vw-2rem))] overflow-y-auto rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-3 shadow-[var(--oh-shadow-card)] sm:p-5"
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {ACTIONS.map(({ label, Icon, href, ...rest }) =>
                    "secondary" in rest && rest.secondary ? (
                      <AdminSecondaryButton
                        key={label}
                        className="min-h-11 w-full justify-center px-2 text-[13px]"
                        onClick={() => {
                          setMenuOpen(false);
                          router.push(href);
                        }}
                      >
                        <Icon size={16} className="shrink-0" /> {label}
                      </AdminSecondaryButton>
                    ) : (
                      <AdminPrimaryButton
                        key={label}
                        className="min-h-11 w-full justify-center px-2 text-[13px]"
                        onClick={() => {
                          setMenuOpen(false);
                          router.push(href);
                        }}
                      >
                        <Icon size={16} className="shrink-0" /> {label}
                      </AdminPrimaryButton>
                    ),
                  )}
                </div>

                <div className="mt-5 border-t border-[var(--oh-border)] pt-5 sm:mt-6 sm:pt-6">
                  <OrdersFilterPanel
                    filters={filters}
                    onChange={setFilters}
                    onFilter={applyFilters}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      }
    >
      {loading ? (
        <div role="status" className="flex flex-col items-center gap-2 py-14 text-sm text-[var(--oh-muted)]">
          <LoaderCircle size={20} className="animate-spin text-[var(--oh-primary)]" aria-hidden="true" />
          Loading orders…
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <p>{error}</p>
          <button type="button" onClick={reload} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-amber-300 bg-white px-4 font-semibold hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800">Try again</button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-[var(--oh-border)] bg-white px-5 py-9 text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-[var(--oh-primary)] ring-1 ring-inset ring-blue-100">
            <ClipboardIcon size={20} strokeWidth={1.7} aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-[var(--oh-text)]">
            {hasActiveFilters ? "No orders match these filters" : "No orders yet"}
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-[var(--oh-muted)]">
            {hasActiveFilters
              ? "Try clearing your filters to see all orders."
              : "Create a stock order to start tracking deliveries and receipts."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {hasActiveFilters ? (
              <AdminSecondaryButton onClick={clearFilters} className="min-h-11 justify-center px-4">
                Clear filters
              </AdminSecondaryButton>
            ) : (
              <AdminPrimaryButton onClick={() => router.push("/orders/new")} className="min-h-11 justify-center px-4">
                <ClipboardIcon size={16} aria-hidden="true" /> Create stock order
              </AdminPrimaryButton>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg md:block">
            <div className="min-w-[1080px]">
              <ListTable
                compact
                headerClassName="bg-[var(--oh-surface)] text-[var(--oh-text-secondary)] ring-1 ring-inset ring-[var(--oh-border)]"
                columns={[
                  { label: "From" }, { label: "To" }, { label: "Date", align: "center" },
                  { label: "Invoice Number", align: "center" }, { label: "Reference", align: "center" },
                  { label: "Status", align: "center" }, { label: "Actions", align: "center", width: "w-[140px]" },
                ]}
                rows={items.map((order) => {
                  const TypeIcon = TYPE_ICONS[order.type] ?? ClipboardIcon;
                  return [
                    <div key="from" className="flex items-center gap-2"><TypeIcon size={16} strokeWidth={1.5} className="shrink-0 text-[var(--oh-muted)]" /><span className="font-medium">{order.fromName || order.fromId || "—"}</span></div>,
                    order.toName || order.toId || "—",
                    formatAuDate(order.orderDate) || "—",
                    order.invoiceNumber || "—",
                    order.reference || "—",
                    <div key="status" className="flex flex-col items-center gap-1"><OrderStatusBadge status={order.status} /><span className="text-xs tabular-nums text-[var(--oh-text-secondary)]">${Number(order.expectedTotal || 0).toFixed(2)} · {order.lineCount || 0} lines</span></div>,
                    <OrderActions key="actions" orderId={order.id} onView={(id) => router.push(`/orders/${id}/view`)} onEdit={(id) => router.push(`/orders/${id}/edit`)} />,
                  ];
                })}
                rowClassName="border-t border-[var(--oh-border)] transition-colors hover:bg-slate-50/70"
              />
            </div>
          </div>
          <ul className="grid gap-3 md:hidden">
            {items.map((order) => {
              const TypeIcon = TYPE_ICONS[order.type] ?? ClipboardIcon;
              return (
                <li key={order.id} className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2"><TypeIcon size={17} className="mt-0.5 shrink-0 text-[var(--oh-muted)]" /><h2 className="min-w-0 break-words text-sm font-semibold text-[var(--oh-text)]">{order.fromName || order.fromId || "—"} <span className="font-normal text-[var(--oh-muted)]">to</span> {order.toName || order.toId || "—"}</h2></div>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-[var(--oh-border)] pt-3">
                    <div><p className="text-xs text-[var(--oh-muted)]">Date</p><p className="mt-1 text-sm text-[var(--oh-text-secondary)]">{formatAuDate(order.orderDate) || "—"}</p></div>
                    <div><p className="text-xs text-[var(--oh-muted)]">Expected total</p><p className="mt-1 text-sm font-semibold tabular-nums text-[var(--oh-text)]">${Number(order.expectedTotal || 0).toFixed(2)} <span className="text-xs font-normal text-[var(--oh-muted)]">· {order.lineCount || 0} lines</span></p></div>
                    <div><p className="text-xs text-[var(--oh-muted)]">Invoice</p><p className="mt-1 break-words text-sm text-[var(--oh-text-secondary)]">{order.invoiceNumber || "—"}</p></div>
                    <div><p className="text-xs text-[var(--oh-muted)]">Reference</p><p className="mt-1 break-words text-sm text-[var(--oh-text-secondary)]">{order.reference || "—"}</p></div>
                  </div>
                  <div className="mt-3 flex justify-end gap-2 border-t border-[var(--oh-border)] pt-2">
                    <button type="button" onClick={() => router.push(`/orders/${order.id}/view`)} className="min-h-11 rounded-md px-3 text-sm font-medium text-[var(--oh-primary)] hover:bg-sky-50">View</button>
                    <button type="button" onClick={() => router.push(`/orders/${order.id}/edit`)} className="min-h-11 rounded-md px-3 text-sm font-medium text-[var(--oh-success)] hover:bg-emerald-50">Edit</button>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
        </>
      )}
    </AdminPageLayout>
  );
}
