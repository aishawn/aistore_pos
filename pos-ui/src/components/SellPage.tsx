"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PlusIcon,
  XIcon,
  DeleteIcon,
  CartIcon,
  ParkingIcon,
  KeyboardIcon,
  ScanIcon,
} from "@/components/icons";
import {
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminNavyButton,
} from "@/components/admin/AdminPageLayout";
import { cn } from "@/lib/utils";
import { GstSummary } from "@/components/GstSummary";
import { formatAuDate, formatAuDateTime } from "@/lib/au";
import { splitMoney, useSellScreen, type LeftView, lineNetTotal } from "@/lib/sell-screen";
import { QuantityKeypadModal } from "@/components/QuantityKeypadModal";
import { SaleKeysPanel } from "@/components/SaleKeysPanel";
import { useDefaultSaleKeys } from "@/hooks/useDefaultSaleKeys";

type WorkspaceTab = "keys" | "parked" | "more";

type MoreActionTone = "blue" | "orange" | "neutral";

type MoreAction = {
  id: string;
  label: string;
  image: string;
  tone: MoreActionTone;
};

/** Matches the live register function pad order (5 × 3). */
const MORE_ACTIONS: MoreAction[] = [
  { id: "promotions", label: "Promotions", image: "/images/keys/functions/promotions.png", tone: "blue" },
  { id: "products", label: "Products", image: "/images/keys/functions/products.png", tone: "blue" },
  { id: "product-details", label: "Product Details", image: "/images/keys/functions/product-details.png", tone: "blue" },
  { id: "open-drawer", label: "Open Drawer", image: "/images/keys/functions/open-drawer.png", tone: "blue" },
  { id: "beer", label: "Beer", image: "/images/keys/functions/beer.png", tone: "orange" },
  { id: "return-product", label: "Return Product", image: "/images/keys/functions/return-product.png", tone: "blue" },
  { id: "reload-invoice", label: "Reload Invoice", image: "/images/keys/functions/reload-invoice.png", tone: "blue" },
  { id: "gift-card", label: "Gift Card", image: "/images/keys/functions/gift-card.png", tone: "blue" },
  { id: "add-note", label: "Add Note", image: "/images/keys/functions/add-note.png", tone: "blue" },
  { id: "wines", label: "Wines", image: "/images/keys/functions/wines.png", tone: "orange" },
  { id: "back-home", label: "Back Home", image: "/images/keys/functions/back-home.png", tone: "neutral" },
  { id: "customer-payment", label: "Customer Payment", image: "/images/keys/functions/customer-payment.png", tone: "blue" },
  { id: "live-profit", label: "Live Profit", image: "/images/keys/functions/live-profit.png", tone: "blue" },
  { id: "create-customer", label: "Create Customer", image: "/images/keys/functions/create-customer.png", tone: "blue" },
  { id: "spirits", label: "Spirits", image: "/images/keys/functions/spirits.png", tone: "orange" },
];

const MORE_ACTION_TONE: Record<
  MoreActionTone,
  { bg: string; border: string; hover: string }
> = {
  blue: {
    bg: "var(--oh-tile-blue-bg)",
    border: "var(--oh-tile-blue-border)",
    hover: "hover:border-[var(--oh-orange)]",
  },
  orange: {
    bg: "var(--oh-tile-orange-bg)",
    border: "var(--oh-tile-orange-border)",
    hover: "hover:border-[var(--oh-orange)]",
  },
  neutral: {
    bg: "white",
    border: "var(--oh-border)",
    hover: "hover:border-[var(--oh-orange)]",
  },
};

function formatParkedTime(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatAuDateTime(iso);
}

/** Sell workspace — project UI, reference POS features, distinct card-based layout. */
export function SellPage() {
  const sell = useSellScreen();
  const [tab, setTab] = useState<WorkspaceTab>("keys");

  useEffect(() => {
    if (sell.view === "parked") {
      setTab("parked");
    } else if (sell.view === "keys" && sell.keypadPage === 0) {
      setTab("keys");
    }
  }, [sell.view, sell.keypadPage]);

  function switchTab(next: WorkspaceTab) {
    setTab(next);
    if (next === "parked") {
      sell.setView("parked");
      sell.setKeypadPage(0);
    } else if (next === "keys") {
      sell.setView("keys");
      sell.setKeypadPage(0);
    } else if (next === "more") {
      sell.setView("keys");
      sell.setKeypadPage(1);
    }
  }

  const overlayView =
    sell.view === "customers" ||
    sell.view === "promotions" ||
    sell.view === "products";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--oh-surface)] p-4 font-sans md:p-5">
      {/* Page header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--oh-text)]">Sell</h1>
          <p className="mt-0.5 text-[13px] text-[var(--oh-muted)]">
            Process sales, manage the cart, and finalise payments
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sell.lines.length > 0 && (
            <span className="rounded-[var(--oh-radius)] border border-[var(--oh-orange-muted)] bg-[var(--oh-orange-light)] px-3 py-1.5 text-[12px] font-semibold text-[var(--oh-orange)]">
              {sell.itemCount} items · ${sell.total.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Tab order is shortcuts → payment → cart. Grid placement keeps payment on top and the cart on the left. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]">
        <section className="relative order-2 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] lg:order-none lg:col-start-2 lg:row-start-2">
          <div className="flex shrink-0 items-center gap-1 border-b border-[var(--oh-border)] px-3 py-2">
            <TabButton
              active={tab === "keys" && !overlayView}
              onClick={() => switchTab("keys")}
              icon={<KeyboardIcon size={15} strokeWidth={1.75} />}
              label="Quick Keys"
            />
            <TabButton
              active={tab === "parked"}
              onClick={() => switchTab("parked")}
              icon={<ParkingIcon size={15} strokeWidth={1.75} />}
              label="Parked Sales"
              badge={sell.parkedSales.length > 0 ? sell.parkedSales.length : undefined}
              badgeTone={sell.parkedSales.some((sale) => sale.stale) ? "warning" : "count"}
            />
            <TabButton
              active={tab === "more" && !overlayView}
              onClick={() => switchTab("more")}
              label="More Actions"
            />
          </div>

          <div className="relative min-h-0 flex-1 overflow-y-auto p-4">
            {overlayView ? (
              <OverlayPanel view={sell.view} />
            ) : tab === "parked" ? (
              <ParkedPanel />
            ) : tab === "more" ? (
              <MoreActionsPanel />
            ) : (
              <QuickKeysPanel onOpenMoreActions={() => switchTab("more")} />
            )}
          </div>
        </section>

        <div className="order-1 shrink-0 lg:order-none lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <PaymentActionStrip />
        </div>

        <CheckoutPanel className="order-3 lg:order-none lg:col-start-1 lg:row-start-2 lg:w-auto" />
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
  badgeTone = "count",
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  badge?: number;
  badgeTone?: "count" | "warning";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
        active
          ? "bg-[var(--oh-orange-light)] text-[var(--oh-orange)]"
          : "text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]",
      )}
    >
      {icon}
      {label}
      {badge != null && (
        <span
          title={
            badgeTone === "warning"
              ? `${badge} parked · includes sales from a previous day`
              : `${badge} parked`
          }
          className={cn(
            "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white",
            badgeTone === "warning" ? "bg-[var(--oh-warning)]" : "bg-[var(--oh-orange)]",
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function targetLine(lines: { id: string; qty: number }[], selectedId: string | null) {
  if (selectedId) {
    const selected = lines.find((line) => line.id === selectedId);
    if (selected) return selected;
  }
  return lines[lines.length - 1];
}

/** − Qty cannot go below 1 on a sale line; delete the line instead. */
function minQtyBlocked(lines: { id: string; qty: number }[], selectedId: string | null) {
  const line = targetLine(lines, selectedId);
  return !!line && line.qty > 0 && line.qty <= 1;
}

function decQtyDisabled(lines: { id: string; qty: number }[], selectedId: string | null) {
  return lines.length === 0 || minQtyBlocked(lines, selectedId);
}

function QuickKeysPanel({ onOpenMoreActions }: { onOpenMoreActions: () => void }) {
  const sell = useSellScreen();
  const { keys, setName, loading, error } = useDefaultSaleKeys();
  const cartEmpty = sell.lines.length === 0;

  return (
    <div className="space-y-5">
      <SaleKeysPanel
        keys={keys}
        setName={setName}
        loading={loading}
        error={error}
        cartEmpty={cartEmpty}
        sell={{ ...sell, onOpenMoreActions, openPromotions: () => sell.openPromotions() }}
      />
      <p className="text-[12px] text-[var(--oh-muted)]">
        Tab moves through each quick key, Enter adds the item, arrow keys move across the grid.
      </p>

      {/* Quantity & cart tools */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
          Line controls
        </p>
        <div className="flex flex-wrap gap-2">
          <ToolBtn label="+ Qty" onClick={() => sell.incQty()} disabled={sell.lines.length === 0} />
          <ToolBtn
            label="− Qty"
            onClick={() => sell.decQty()}
            disabled={decQtyDisabled(sell.lines, sell.selectedId)}
            title={
              minQtyBlocked(sell.lines, sell.selectedId)
                ? "Keep at least 1 item. Use delete to remove the line."
                : undefined
            }
          />
          <ToolBtn label="Case Qty" onClick={() => sell.applyCaseQuantity()} disabled={sell.lines.length === 0} />
          <ToolBtn
            label="Return Item"
            onClick={() => sell.returnSelectedItem()}
            disabled={sell.lines.length === 0}
            variant="danger"
          />
          <ToolBtn
            label="Discount"
            onClick={() => sell.openDiscountDialog()}
            disabled={sell.lines.length === 0}
          />
          <ToolBtn
            label="Park Sale"
            onClick={() => sell.parkCurrentSale()}
            disabled={sell.lines.length === 0 || sell.busy}
          />
          <ToolBtn
            label="Clear Sale"
            onClick={() => sell.requestClear()}
            disabled={sell.lines.length === 0}
            variant="danger"
          />
        </div>
      </div>
    </div>
  );
}

function MoreActionsPanel() {
  const sell = useSellScreen();
  const router = useRouter();

  function run(action: MoreAction) {
    switch (action.id) {
      case "back-home":
        sell.setView("keys");
        sell.setKeypadPage(0);
        return;
      case "promotions":
        sell.openPromotions();
        return;
      case "products":
        sell.openProducts("Products");
        return;
      case "beer":
        sell.openProducts("Beer");
        return;
      case "wines":
        sell.openProducts("Wines");
        return;
      case "spirits":
        sell.openProducts("Spirits");
        return;
      case "product-details":
        sell.showProductDetails();
        return;
      case "open-drawer":
        sell.runAction("Open Cash Drawer");
        return;
      case "return-product":
        sell.returnSelectedItem();
        return;
      case "add-note":
        sell.openNoteDialog();
        return;
      case "create-customer":
        router.push("/customers/new");
        return;
      case "customer-payment":
        if (sell.customer) {
          router.push(`/customers/${sell.customer.id}/payment`);
        } else {
          sell.setView("customers");
        }
        return;
      case "reload-invoice":
        router.push("/history");
        return;
      case "gift-card":
        router.push("/giftcards");
        return;
      case "live-profit":
        router.push("/reports/sales");
        return;
      default:
        sell.runAction(action.label);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
            Register actions
          </p>
          {sell.saleNote && (
            <p className="mt-0.5 max-w-[280px] truncate text-[12px] text-[var(--oh-tile-blue-text)]">
              Note: {sell.saleNote}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            sell.setView("keys");
            sell.setKeypadPage(0);
          }}
          className="cursor-pointer text-[12px] font-medium text-[var(--oh-orange)] hover:underline"
        >
          ← Back to Quick Keys
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
        {MORE_ACTIONS.map((action) => {
          const tone = MORE_ACTION_TONE[action.tone];
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => run(action)}
              aria-label={action.label}
              className={cn(
                "flex aspect-square max-h-[120px] w-full cursor-pointer flex-col items-center justify-center rounded-[var(--oh-radius)] border p-1 shadow-[var(--oh-shadow-card)] transition-all",
                "hover:opacity-95 hover:shadow-md active:scale-[0.98]",
                tone.hover,
              )}
              style={{ backgroundColor: tone.bg, borderColor: tone.border }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={action.image}
                alt=""
                className="h-[88px] w-auto max-w-[96%] object-contain sm:h-[96px]"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ParkedPanel() {
  const sell = useSellScreen();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
          Suspended sales
        </p>
        <AdminSecondaryButton onClick={() => sell.refreshParked()} disabled={sell.parkedLoading}>
          Refresh
        </AdminSecondaryButton>
      </div>
      <p className="text-[12px] text-[var(--oh-muted)]">
        Kept through the next business day. Previous-day parks are marked overdue; older parks are voided automatically.
      </p>

      {sell.lines.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--oh-radius)] border border-[var(--oh-tile-blue-border)] bg-[var(--oh-tile-blue-bg)] px-4 py-3">
          <span className="text-[13px] text-[var(--oh-tile-blue-text)]">
            Active sale — {sell.itemCount} items, ${sell.total.toFixed(2)}
            {sell.saleNote ? ` · Note: ${sell.saleNote}` : ""}
          </span>
          <AdminPrimaryButton
            onClick={() => sell.parkCurrentSale()}
            disabled={sell.busy}
          >
            Park Sale
          </AdminPrimaryButton>
        </div>
      )}

      {sell.parkedLoading ? (
        <p className="py-8 text-center text-[14px] text-[var(--oh-muted)]">Loading parked sales…</p>
      ) : sell.parkedSales.length === 0 ? (
        <div className="rounded-[var(--oh-radius)] border border-dashed border-[var(--oh-border)] py-10 text-center">
          <p className="text-[14px] font-medium text-[var(--oh-text-secondary)]">No parked sales</p>
          <p className="mt-1 text-[12px] text-[var(--oh-muted)]">
            Park the current cart to resume it later from this list
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--oh-border)] rounded-[var(--oh-radius)] border border-[var(--oh-border)]">
          {sell.parkedSales.map((sale) => {
            const total = splitMoney(Number(sale.totalPrice));
            const when = formatParkedTime(sale.createdAt);
            const clears = sale.clearsOn ? formatAuDate(sale.clearsOn) : "";
            return (
              <li
                key={sale.id}
                className={cn(
                  "flex items-stretch",
                  sale.stale && "bg-[var(--oh-tile-orange-bg)]",
                )}
              >
                <button
                  type="button"
                  onClick={() => sell.requestResumeParked(String(sale.id))}
                  disabled={sell.busy}
                  className="flex min-w-0 flex-1 cursor-pointer items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--oh-surface)] disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium text-[var(--oh-text)]">
                      {sale.customerName ?? "Walk-in customer"}
                    </span>
                    <span className="block text-[12px] text-[var(--oh-muted)]">
                      {sale.totalQuantity} items
                      {when ? ` · ${when}` : ""}
                      {sale.note ? ` · ${sale.note}` : ""}
                    </span>
                    {sale.stale && (
                      <span className="mt-0.5 block text-[12px] font-medium text-[var(--oh-warning)]">
                        Overdue{clears ? ` · cleared ${clears}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="ml-3 shrink-0 text-[15px] font-semibold text-[var(--oh-text)]">
                    ${total.whole}.{total.cents}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Discard parked sale"
                  disabled={sell.busy}
                  onClick={() => sell.voidParked(String(sale.id))}
                  className="shrink-0 cursor-pointer border-l border-[var(--oh-border)] px-3 text-[var(--oh-muted)] hover:bg-[var(--oh-tile-red-bg)] hover:text-[var(--oh-tile-red-text)] disabled:opacity-50"
                >
                  <DeleteIcon size={15} strokeWidth={1.75} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PaymentActionStrip() {
  const sell = useSellScreen();
  const router = useRouter();
  const hasItems = sell.lines.length > 0;
  const { whole, cents } = splitMoney(sell.total);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AdminNavyButton
        onClick={() => sell.startPayment("EFTPOS VISA MasterCard")}
        disabled={!hasItems}
      >
        EFTPOS
      </AdminNavyButton>
      <AdminSecondaryButton
        onClick={() => sell.startPayment("Exact Cash")}
        disabled={!hasItems}
      >
        Exact Cash
      </AdminSecondaryButton>
      <AdminSecondaryButton
        onClick={() => sell.startPayment("Eftpos Cash Out")}
        disabled={!hasItems}
      >
        Cash Out
      </AdminSecondaryButton>
      <AdminSecondaryButton
        onClick={() => sell.applyCaseQuantity()}
        disabled={!hasItems}
      >
        Case Quantity
      </AdminSecondaryButton>
      <AdminSecondaryButton
        onClick={() => sell.requestClear()}
        disabled={!hasItems}
      >
        Clear Sale
      </AdminSecondaryButton>
      <div className="ml-auto flex items-center gap-3">
        {hasItems && (
          <span className="text-[22px] font-bold leading-none text-[var(--oh-text)]">
            ${whole}
            <span className="text-[14px]">.{cents}</span>
          </span>
        )}
        <button
          type="button"
          disabled={!hasItems}
          onClick={() => router.push("/finalise")}
          className={cn(
            "cursor-pointer rounded-[var(--oh-radius)] px-5 py-2 text-[14px] font-semibold text-white transition-colors",
            hasItems
              ? "bg-[var(--oh-orange)] hover:bg-[var(--oh-orange-hover)]"
              : "cursor-not-allowed bg-[var(--oh-border-strong)]",
          )}
        >
          Finalise Sale
        </button>
      </div>
    </div>
  );
}

function CheckoutPanel({ className }: { className?: string }) {
  const sell = useSellScreen();
  const { whole, cents } = splitMoney(sell.total);
  const hasItems = sell.lines.length > 0;
  const [qtyKeypadLineId, setQtyKeypadLineId] = useState<string | null>(null);
  const qtyKeypadLine = qtyKeypadLineId
    ? sell.lines.find((l) => l.id === qtyKeypadLineId)
    : null;

  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] lg:w-[380px]",
        className,
      )}
    >
      {/* Customer */}
      <div className="border-b border-[var(--oh-border)] px-4 py-3">
        {sell.customer ? (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--oh-navy)] text-[13px] font-bold text-white">
              {sell.customer.name.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-[var(--oh-text)]">
                {sell.customer.name}
              </p>
              <p className="text-[12px] text-[var(--oh-muted)]">
                {sell.customer.loyaltyPoints} loyalty points
              </p>
            </div>
            <button
              type="button"
              aria-label="Remove customer"
              onClick={() => sell.setCustomer(null)}
              className="cursor-pointer text-[var(--oh-muted)] hover:text-[var(--oh-danger)]"
            >
              <XIcon size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => sell.setView("customers")}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--oh-border)] px-3 py-2.5 text-[13px] font-medium text-[var(--oh-text-secondary)] transition-colors hover:border-[var(--oh-orange)] hover:text-[var(--oh-orange)]"
          >
            <PlusIcon size={15} strokeWidth={1.75} />
            Add customer
          </button>
        )}
      </div>

      {/* Cart lines */}
      <div className="min-h-[120px] flex-1 overflow-y-auto">
        {!hasItems ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <CartIcon size={28} className="text-[var(--oh-border-strong)]" />
            <p className="text-[14px] font-medium text-[var(--oh-text-secondary)]">Cart is empty</p>
            <p className="text-[12px] text-[var(--oh-muted)]">
              Search or tap a quick key to add items
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--oh-border)]">
            {sell.lines.map((line) => {
              const isReturn = line.qty < 0;
              const net = lineNetTotal(line);
              const lineTotal = splitMoney(Math.abs(net));
              const selected = sell.selectedId === line.id;
              return (
                <li key={line.id}>
                  <div
                    role="button"
                    tabIndex={-1}
                    onClick={() => sell.selectLine(line.id)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors",
                      selected ? "bg-[var(--oh-orange-light)]/50" : "hover:bg-[var(--oh-surface)]",
                      isReturn && "bg-[var(--oh-tile-red-bg)]/80",
                    )}
                  >
                    <button
                      type="button"
                      aria-label={`Edit quantity for ${line.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        sell.selectLine(line.id);
                        setQtyKeypadLineId(line.id);
                      }}
                      className={cn(
                        "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border bg-[var(--oh-surface)] text-[12px] font-semibold transition-colors hover:border-[var(--oh-orange)] hover:text-[var(--oh-orange)]",
                        isReturn
                          ? "border-[var(--oh-tile-red-border)] text-[var(--oh-danger)]"
                          : "border-[var(--oh-border)] text-[var(--oh-text-secondary)]",
                      )}
                    >
                      {line.qty}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-[13px] font-medium",
                          isReturn ? "text-[var(--oh-danger)]" : "text-[var(--oh-text)]",
                        )}
                      >
                        {isReturn ? "Return · " : ""}
                        {line.name}
                      </p>
                      {(Math.abs(line.qty) > 1 || line.discount) && (
                        <p className="text-[11px] text-[var(--oh-muted)]">
                          ${line.unitPrice.toFixed(2)} each
                          {line.discount ? ` · −$${line.discount.toFixed(2)} disc.` : ""}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-[13px] font-semibold",
                        isReturn ? "text-[var(--oh-danger)]" : "text-[var(--oh-text)]",
                      )}
                    >
                      {isReturn ? "−" : ""}${lineTotal.whole}.{lineTotal.cents}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${line.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        sell.removeLine(line.id);
                      }}
                      className="shrink-0 cursor-pointer text-[var(--oh-muted)] hover:text-[var(--oh-danger)]"
                    >
                      <DeleteIcon size={15} strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <QuantityKeypadModal
        open={qtyKeypadLine != null}
        initialQty={Math.abs(qtyKeypadLine?.qty ?? 1)}
        productName={qtyKeypadLine?.name}
        onConfirm={(qty) => {
          if (qtyKeypadLineId) {
            const line = sell.lines.find((l) => l.id === qtyKeypadLineId);
            const signed = line && line.qty < 0 ? -qty : qty;
            sell.setLineQty(qtyKeypadLineId, signed);
          }
        }}
        onClose={() => setQtyKeypadLineId(null)}
      />

      {/* Summary */}
      <div className="border-t border-[var(--oh-border)] bg-[var(--oh-surface)]/50 p-4">
        <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-[var(--oh-muted)]">
          <span>{sell.itemCount} {sell.itemCount === 1 ? "item" : "items"}</span>
          <span className="text-right">{sell.productCount} products</span>
          <span>Savings ${sell.discountTotal.toFixed(2)}</span>
          <span className="text-right">Discount ${sell.discountTotal.toFixed(2)}</span>
        </div>
        {hasItems && (
          <div className="mb-3">
            <GstSummary
              total={sell.total}
              gst={sell.gstTotal}
              pricesIncludeGst={sell.pricesIncludeGst}
              onTogglePrices={sell.setPricesIncludeGst}
            />
          </div>
        )}
        <div className="flex items-end justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
            Total
          </span>
          <p className="text-[32px] font-bold leading-none text-[var(--oh-text)]">
            ${whole}
            <span className="text-[20px]">.{cents}</span>
          </p>
        </div>
        {sell.saleNote && (
          <p className="mt-2 truncate text-[11px] text-[var(--oh-muted)]">Note: {sell.saleNote}</p>
        )}
      </div>
    </aside>
  );
}

function OverlayPanel({ view }: { view: LeftView }) {
  if (view === "customers") return <CustomerPanel />;
  if (view === "promotions") return <PromotionsPanel />;
  if (view === "products") return <ProductsPanel />;
  return null;
}

function CustomerPanel() {
  const sell = useSellScreen();
  const [q, setQ] = useState(sell.searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQ(sell.searchQuery);
  }, [sell.searchQuery]);

  function onSearch(value: string) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => sell.loadCustomers(value), 250);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => sell.setView("keys")}
          className="cursor-pointer text-[13px] font-medium text-[var(--oh-orange)] hover:underline"
        >
          ← Back
        </button>
        <input
          type="text"
          value={q}
          placeholder="Search customers…"
          onChange={(e) => onSearch(e.target.value)}
          className="h-9 flex-1 rounded-lg border border-[var(--oh-border)] px-3 text-[13px] outline-none focus:border-[var(--oh-orange)]"
          autoFocus
        />
        <AdminSecondaryButton onClick={() => sell.runAction("Create Customer")}>
          <ScanIcon size={14} />
          New
        </AdminSecondaryButton>
      </div>
      <ul className="divide-y divide-[var(--oh-border)] rounded-[var(--oh-radius)] border border-[var(--oh-border)]">
        {sell.customers.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => {
                sell.setCustomer(c);
                sell.setView("keys");
              }}
              className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left hover:bg-[var(--oh-surface)]"
            >
              <span>
                <span className="block text-[14px] font-medium text-[var(--oh-text)]">{c.name}</span>
                <span className="block text-[12px] text-[var(--oh-muted)]">{c.group}</span>
              </span>
              <span className="text-[12px] text-[var(--oh-muted)]">{c.loyaltyPoints} pts</span>
            </button>
          </li>
        ))}
      </ul>
      {sell.customers.length === 0 && (
        <p className="py-6 text-center text-[13px] text-[var(--oh-muted)]">No customers found</p>
      )}
    </div>
  );
}

const PERIOD_LABELS: Record<string, string> = {
  current: "Current",
  future: "Future",
  all: "All",
};

function PromotionsPanel() {
  const sell = useSellScreen();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onFilter(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => sell.setPromotionFilter(value), 300);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => sell.backToKeys()}
          className="cursor-pointer text-[13px] font-medium text-[var(--oh-orange)] hover:underline"
        >
          ← Back
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => sell.setPromotionMenuOpen(!sell.promotionMenuOpen)}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--oh-border)] px-3 py-1.5 text-[13px]"
          >
            {PERIOD_LABELS[sell.promotionPeriod]}
            <span className="text-[10px]">▼</span>
          </button>
          {sell.promotionMenuOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 min-w-[120px] rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-lg">
              {(["all", "current", "future"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => sell.setPromotionPeriod(p)}
                  className={cn(
                    "block w-full cursor-pointer px-4 py-2 text-left text-[13px] hover:bg-[var(--oh-surface)]",
                    sell.promotionPeriod === p && "bg-[var(--oh-orange-light)] font-medium",
                  )}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <input
        type="text"
        placeholder="Filter promotions…"
        onChange={(e) => onFilter(e.target.value)}
        className="h-9 w-full rounded-lg border border-[var(--oh-border)] px-3 text-[13px] outline-none focus:border-[var(--oh-orange)]"
      />
      {sell.promotionLoading ? (
        <p className="py-6 text-center text-[13px] text-[var(--oh-muted)]">Loading…</p>
      ) : sell.promotionItems.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-[var(--oh-muted)]">No promotions found</p>
      ) : (
        <ul className="divide-y divide-[var(--oh-border)] rounded-[var(--oh-radius)] border border-[var(--oh-border)]">
          {sell.promotionItems.map((item, i) => (
            <li key={`${item.productId}-${item.promotionId}-${i}`}>
              <button
                type="button"
                onClick={() => sell.pickPromotionProduct(item)}
                className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left hover:bg-[var(--oh-surface)]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-[var(--oh-text)]">
                    {item.productName}
                  </span>
                  <span className="block text-[12px] text-[var(--oh-muted)]">
                    {item.promotionName}
                  </span>
                </span>
                <span className="ml-2 shrink-0 text-[13px] font-semibold">
                  ${Number(item.price).toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductsPanel() {
  const sell = useSellScreen();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative mb-3 flex shrink-0 items-center justify-center border-b border-[var(--oh-border)] pb-3">
        <button
          type="button"
          onClick={() => sell.backToKeys()}
          className="absolute left-0 cursor-pointer text-[13px] font-medium text-[var(--oh-text)] hover:text-[var(--oh-orange)]"
        >
          ← Back
        </button>
        <span className="text-[15px] font-semibold text-[var(--oh-text)]">
          {sell.productFolder}
        </span>
      </div>
      {sell.productLoading ? (
        <p className="py-10 text-center text-[13px] text-[var(--oh-muted)]">Loading…</p>
      ) : sell.productItems.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-[var(--oh-muted)]">No products found</p>
      ) : (
        <div className="grid grid-cols-2 gap-[3px] bg-[#c8c8c8] sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {sell.productItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => sell.pickBrowseProduct(item)}
              className="flex min-h-[72px] cursor-pointer items-center justify-center bg-[#4a4a4a] px-2 py-3 text-center transition-colors hover:bg-[#5a5a5a] active:bg-[#3a3a3a]"
            >
              <span className="line-clamp-3 text-[12px] font-medium leading-snug text-white sm:text-[13px]">
                {item.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolBtn({
  label,
  onClick,
  disabled,
  title,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      aria-disabled={disabled || undefined}
      title={title}
      onClick={() => {
        if (!disabled) onClick();
      }}
      className={cn(
        "cursor-pointer rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-orange)] aria-disabled:cursor-not-allowed aria-disabled:opacity-40",
        variant === "danger"
          ? "border-[var(--oh-tile-red-border)] bg-[var(--oh-tile-red-bg)] text-[var(--oh-tile-red-text)] hover:opacity-90"
          : "border-[var(--oh-border)] bg-white text-[var(--oh-text-secondary)] hover:border-[var(--oh-orange)] hover:text-[var(--oh-text)]",
      )}
    >
      {label}
    </button>
  );
}
