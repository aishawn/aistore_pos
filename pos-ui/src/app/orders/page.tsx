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
import {
  AdminPageLayout,
  AdminPrimaryButton,
  AdminSecondaryButton,
} from "@/components/admin/AdminPageLayout";
import { AsyncState } from "@/components/admin/AsyncState";
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
  OPEN: "bg-[var(--oh-primary)]",
  SENT: "bg-[var(--oh-tile-blue-text)]",
  RECEIVED: "bg-[var(--oh-success)]",
  CANCELLED: "bg-neutral-400",
  OUTSTANDING: "bg-[var(--oh-orange)]",
};

function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[13px] font-semibold uppercase tracking-wide text-white ${STATUS_STYLES[status] ?? "bg-neutral-500"}`}
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
    <div className="flex flex-col items-center gap-1 text-[13px] font-medium">
      <button
        type="button"
        onClick={() => onView(orderId)}
        className="flex cursor-pointer items-center gap-1 text-[var(--oh-orange)] hover:underline"
      >
        <ViewIcon size={14} /> View
      </button>
      <button
        type="button"
        onClick={() => onEdit(orderId)}
        className="flex cursor-pointer items-center gap-1 text-[var(--oh-success)] hover:underline"
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

  const { items, total, loading, error } = useApiList<Order>("/api/orders", {
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

  return (
    <AdminPageLayout
      title="Orders"
      subtitle="Manage stock orders, transfers, receipts and returns"
      compact
      actions={
        <>
          <div className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-4 py-2 text-center shadow-[var(--oh-shadow-card)]">
            <div className="text-[22px] font-bold leading-none text-[var(--oh-text)]">{total}</div>
            <div className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
              Results
            </div>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="dialog"
              aria-label="Menu"
              className="relative flex h-10 items-center gap-2 rounded-[var(--oh-radius)] bg-[var(--oh-primary)] px-3 text-[13px] font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[var(--oh-primary-hover)]"
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
                className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(1180px,calc(100vw-2rem))] rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-8 py-7 shadow-[var(--oh-shadow-card)]"
              >
                <div className="grid grid-cols-[repeat(6,minmax(0,1fr))] gap-3">
                  {ACTIONS.map(({ label, Icon, href, ...rest }) =>
                    "secondary" in rest && rest.secondary ? (
                      <AdminSecondaryButton
                        key={label}
                        className="w-full justify-center px-2 text-[13px]"
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
                        className="w-full justify-center px-2 text-[13px]"
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

                <div className="mt-7 border-t border-[var(--oh-border)] pt-7">
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
      <AsyncState loading={loading} error={error} empty={items.length === 0}>
        <ListTable
          compact
          columns={[
            { label: "From" },
            { label: "To" },
            { label: "Date", align: "center" },
            { label: "Invoice Number", align: "center" },
            { label: "Reference", align: "center" },
            { label: "Status", align: "center" },
            { label: "Actions", align: "center", width: "w-[100px]" },
          ]}
          rows={items.map((o) => {
            const TypeIcon = TYPE_ICONS[o.type] ?? ClipboardIcon;
            return [
              <div key="from" className="flex items-center gap-2">
                <TypeIcon size={16} strokeWidth={1.5} className="shrink-0 text-[var(--oh-muted)]" />
                <span className="font-medium">{o.fromName || o.fromId || "—"}</span>
              </div>,
              o.toName || o.toId || "—",
              formatAuDate(o.orderDate) || "—",
              o.invoiceNumber,
              o.reference || "—",
              <div key="status" className="flex flex-col items-center gap-0.5">
                <OrderStatusBadge status={o.status} />
                <span className="text-[13px] text-[var(--oh-text-secondary)]">
                  {`$${Number(o.expectedTotal || 0).toFixed(2)}`}
                </span>
                <span className="text-[13px] uppercase tracking-wide text-[var(--oh-muted)]">
                  {`${o.lineCount || 0} lines`}
                </span>
              </div>,
              <OrderActions
                key="actions"
                orderId={o.id}
                onView={(id) => router.push(`/orders/${id}/view`)}
                onEdit={(id) => router.push(`/orders/${id}/edit`)}
              />,
            ];
          })}
        />
        <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
      </AsyncState>
    </AdminPageLayout>
  );
}
