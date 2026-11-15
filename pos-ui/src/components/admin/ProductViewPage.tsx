"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi, useApiList } from "@/hooks/useApi";
import { AsyncDependencyNotice, AsyncState } from "@/components/admin/AsyncState";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { AlertDialog } from "@/components/admin/AlertDialog";
import { ListTable } from "@/components/admin/ListTable";
import type { ProductDetail } from "@/components/admin/EditProductPage";
import {
  ArrowLeftIcon,
  ClipboardIcon,
  DeleteIcon,
  EditIcon,
  LineChartIcon,
  ReceiptIcon,
  RefreshIcon,
  TransferIcon,
  TruckIcon,
  WarehouseIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

type NavId =
  | "home"
  | "sales-summary"
  | "sales-history"
  | "purchase-history"
  | "transfer-history"
  | "promotions"
  | "revision-history"
  | "inventory-log";

interface ProductRevision {
  id: string;
  action?: string;
  summary?: string;
  userName?: string;
  createdAt?: string;
}

interface ActivityChart {
  sales: number[];
  purchases: number[];
}

interface ProductSaleLine {
  saleId?: string;
  invoiceId?: string;
  soldAt?: string;
  quantity?: number | null;
  unitPrice?: number | null;
  totalPrice?: number | null;
  userName?: string;
}

interface ProductOrderLine {
  orderId?: string;
  invoiceNumber?: string;
  reference?: string;
  status?: string;
  type?: string;
  occurredAt?: string;
  quantity?: number | null;
  unitCost?: number | null;
}

interface InventoryEvent {
  occurredAt?: string;
  type?: string;
  reference?: string;
  quantity?: number | null;
}

const EMPTY_YEAR = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

const NAV: { id: NavId; label: string; description: string; Icon: typeof LineChartIcon }[] = [
  {
    id: "home",
    label: "Home",
    description: "View product details and basic statistics",
    Icon: LineChartIcon,
  },
  {
    id: "sales-summary",
    label: "Sales Summary",
    description: "See a quick snapshot of this product's sales history",
    Icon: LineChartIcon,
  },
  {
    id: "sales-history",
    label: "Sales History",
    description: "View all sales for this product",
    Icon: ReceiptIcon,
  },
  {
    id: "purchase-history",
    label: "Purchase History",
    description: "View all purchases for this product",
    Icon: TruckIcon,
  },
  {
    id: "transfer-history",
    label: "Transfer History",
    description: "View all transfers for this product",
    Icon: TransferIcon,
  },
  {
    id: "promotions",
    label: "Promotions",
    description: "Check which promotions apply to the product",
    Icon: ClipboardIcon,
  },
  {
    id: "revision-history",
    label: "Revision History",
    description: "Check the recent changes made to this product",
    Icon: RefreshIcon,
  },
  {
    id: "inventory-log",
    label: "Inventory Log",
    description: "View the changes made to the inventory",
    Icon: WarehouseIcon,
  },
];

const MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];

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

function marginPct(price?: number | null, cost?: number | null) {
  if (price == null || cost == null || price === 0) return "—";
  return `${(((price - cost) / price) * 100).toFixed(1)}%`;
}

function splitCasesItems(total?: number | null, caseQuantity?: number | null) {
  const value = Number(total ?? 0);
  const caseQty = Number(caseQuantity ?? 0);
  if (Number.isFinite(caseQty) && caseQty > 0 && Number.isFinite(value)) {
    const cases = Math.floor(value / caseQty);
    return { cases, items: value - cases * caseQty };
  }
  return { cases: 0, items: Number.isFinite(value) ? value : 0 };
}

/** Dual-line area chart for sales (blue) and purchases (red). July–June. */
function SalesPurchasesChart({
  sales,
  purchases,
}: {
  sales: number[];
  purchases: number[];
}) {
  const w = 640;
  const h = 200;
  const pad = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const peak = Math.max(1, ...sales, ...purchases);
  const maxVal = Math.max(220, Math.ceil(peak / 50) * 50);
  const step = innerW / (MONTHS.length - 1);

  function path(values: number[], fill: string, stroke: string) {
    const coords = values.map((v, i) => [
      pad.left + i * step,
      pad.top + innerH - (v / maxVal) * innerH,
    ]);
    const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${line} L${pad.left + innerW},${pad.top + innerH} L${pad.left},${pad.top + innerH} Z`;
    return (
      <g>
        <path d={area} fill={fill} opacity={0.15} />
        <path d={line} fill="none" stroke={stroke} strokeWidth={2} />
      </g>
    );
  }

  const yTicks = [0, 1, 2, 3, 4].map((i) => Math.round((maxVal * i) / 4));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[480px]" aria-label="Sales and purchases chart">
        {yTicks.map((tick) => {
          const y = pad.top + innerH - (tick / maxVal) * innerH;
          return (
            <g key={tick}>
              <line
                x1={pad.left}
                y1={y}
                x2={pad.left + innerW}
                y2={y}
                stroke="var(--oh-border)"
                strokeDasharray="4 4"
              />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" className="fill-[var(--oh-muted)] text-[13px]">
                ${tick}
              </text>
            </g>
          );
        })}
        {path(purchases, "#e53e3e", "#e53e3e")}
        {path(sales, "#2b6cb0", "#2b6cb0")}
        {MONTHS.map((m, i) => (
          <text
            key={m}
            x={pad.left + i * step}
            y={h - 6}
            textAnchor="middle"
            className="fill-[var(--oh-muted)] text-[13px]"
          >
            {m}
          </text>
        ))}
      </svg>
      <div className="mt-2 flex justify-center gap-6 text-[13px]">
        <span className="flex items-center gap-1.5 text-[var(--oh-text-secondary)]">
          <span className="inline-block h-0.5 w-4 bg-[#e53e3e]" /> Purchases
        </span>
        <span className="flex items-center gap-1.5 text-[var(--oh-text-secondary)]">
          <span className="inline-block h-0.5 w-4 bg-[#2b6cb0]" /> Sales
        </span>
      </div>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
<div className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)]">
      <h3 className="mb-3 text-[13px] font-semibold text-[var(--oh-text)]">{title}</h3>
      {children}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex border-b border-[var(--oh-border)] py-2.5 last:border-b-0">
      <span className="w-[120px] shrink-0 text-[13px] text-[var(--oh-muted)]">{label}</span>
      <span className="text-[13px] font-medium text-[var(--oh-text)]">{value}</span>
    </div>
  );
}

function PlaceholderPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--oh-radius)] border border-dashed border-[var(--oh-border)] bg-[var(--oh-surface)] py-20 text-center">
      <h3 className="text-[16px] font-semibold text-[var(--oh-text)]">{title}</h3>
      <p className="mt-2 max-w-sm text-[13px] text-[var(--oh-muted)]">{description}</p>
      <p className="mt-4 text-[13px] text-[var(--oh-placeholder)]">No records to display yet.</p>
    </div>
  );
}

function ActivityTable({
  loading,
  error,
  empty,
  emptyText,
  onRetry,
  columns,
  rows,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText: string;
  onRetry: () => void;
  columns: { label: string; width?: string; align?: "left" | "right" | "center" }[];
  rows: React.ReactNode[][];
}) {
  return (
    <AsyncState loading={loading} error={error} empty={empty} emptyText={emptyText} onRetry={onRetry}>
      <ListTable columns={columns} rows={rows} defaultSort={{ column: 0, direction: "desc" }} />
    </AsyncState>
  );
}

function ProductRevisionPanel({
  revisions,
  loading,
  error,
  onRetry,
}: {
  revisions: ProductRevision[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <AsyncState
      loading={loading}
      error={error}
      empty={revisions.length === 0}
      emptyText="No revision history recorded for this product yet."
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
        defaultSort={{ column: 0, direction: "desc" }}
      />
    </AsyncState>
  );
}

function ProductHomeReport({
  product,
  taxRateName,
  familyName,
  coreSupplierName,
  coreSupplierId,
  chart,
}: {
  product: ProductDetail;
  taxRateName?: string;
  familyName?: string;
  coreSupplierName?: string;
  coreSupplierId?: string;
  chart: ActivityChart | null;
}) {
  const router = useRouter();
  const priceRows: React.ReactNode[][] = [];
  if (product.price != null) {
    priceRows.push([
      "Default Price",
      "1",
      money(product.price),
      money(product.cost),
      marginPct(product.price, product.cost),
    ]);
  }
  if (priceRows.length === 0) {
    priceRows.push(["Default Price", "1", "—", money(product.cost), "—"]);
  }

  const barcodeRows: React.ReactNode[][] =
    product.barcodes && product.barcodes.length > 0
      ? product.barcodes.map((b) => ["1", b.code])
      : [["1", "—"]];

  const { cases, items } = splitCasesItems(product.stockQuantity, product.caseQuantity);

  return (
    <div className="space-y-4">
      <InfoCard title="Sales & Purchases">
        <SalesPurchasesChart
          sales={chart?.sales?.length === 12 ? chart.sales : EMPTY_YEAR}
          purchases={chart?.purchases?.length === 12 ? chart.purchases : EMPTY_YEAR}
        />
      </InfoCard>

      <InfoCard title="Relevant Prices">
        <ListTable
          columns={[
            { label: "Source" },
            { label: "Quantity", width: "w-[90px]", align: "center" },
            { label: "Price", width: "w-[90px]", align: "right" },
            { label: "Cost", width: "w-[90px]", align: "right" },
            { label: "%", width: "w-[60px]", align: "right" },
          ]}
          rows={priceRows}
        />
      </InfoCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <InfoCard title="Product Information">
          <MetaRow label="Case Quantity" value={product.caseQuantity ?? "—"} />
          <MetaRow label="Tax Rate" value={taxRateName ?? "—"} />
          <MetaRow label="ABV %" value={product.abv != null ? `${Number(product.abv).toFixed(1)}%` : "—"} />
          <MetaRow label="Volume" value={product.volumeMl != null ? `${product.volumeMl} ml` : "—"} />
          <MetaRow label="Region" value={product.region?.trim() || "—"} />
          <MetaRow label="Vintage" value={product.vintage?.trim() || "—"} />
          <MetaRow label="Category" value={product.categoryName ?? "—"} />
          <MetaRow label="Brand" value={product.brandName ?? "—"} />
          <MetaRow label="Family" value={familyName ?? "—"} />
        </InfoCard>

        <div className="space-y-4">
          <InfoCard title="Inventory">
            <div className="flex gap-8">
              <div>
                <div className="text-[28px] font-bold leading-none text-[var(--oh-text)]">{cases}</div>
                <div className="mt-1 text-[13px] text-[var(--oh-muted)]">Cases</div>
              </div>
              <div>
                <div className="text-[28px] font-bold leading-none text-[var(--oh-text)]">{items}</div>
                <div className="mt-1 text-[13px] text-[var(--oh-muted)]">Items</div>
              </div>
            </div>
          </InfoCard>

          <InfoCard title="Barcodes">
            <ListTable
              columns={[
                { label: "Quantity", width: "w-[90px]", align: "center" },
                { label: "Barcode" },
              ]}
              rows={barcodeRows}
            />
          </InfoCard>

          <InfoCard title="Core Supplier">
            {coreSupplierName ? (
              coreSupplierId ? (
                <button
                  type="button"
                  onClick={() => router.push(`/suppliers/${coreSupplierId}/edit`)}
                  className="text-[14px] font-medium text-[var(--oh-primary)] hover:underline"
                >
                  {coreSupplierName}
                </button>
              ) : (
                <p className="text-[14px] font-medium text-[var(--oh-text)]">{coreSupplierName}</p>
              )
            ) : coreSupplierId ? (
              <p className="text-[14px] text-[var(--oh-muted)]">Loading…</p>
            ) : (
              <p className="text-[14px] text-[var(--oh-muted)]">No supplier assigned</p>
            )}
          </InfoCard>
        </div>
      </div>
    </div>
  );
}

export function ProductViewPage({ productId }: { productId: string }) {
  const router = useRouter();
  const [nav, setNav] = useState<NavId>("home");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: product, loading, error, reload: reloadProduct } = useApi<ProductDetail>(
    productId ? `/api/products/${productId}` : null,
  );
  const taxRates = useApi<{ id: string; name: string }[]>("/api/tax-rates");
  const families = useApi<{ id: string; name: string }[]>("/api/classifications/family");
  const suppliers = useApi<{ items: { id: string; name: string }[] }>("/api/suppliers", {
    size: 200,
  });
  const revisions = useApiList<ProductRevision>(
    nav === "revision-history" ? `/api/products/${productId}/revisions` : null,
    { page: 1, size: 50 },
  );
  const chart = useApi<ActivityChart>(productId ? `/api/products/${productId}/activity-chart` : null);
  const sales = useApi<ProductSaleLine[]>(
    nav === "sales-history" || nav === "sales-summary" ? `/api/products/${productId}/sales` : null,
  );
  const purchases = useApi<ProductOrderLine[]>(
    nav === "purchase-history" ? `/api/products/${productId}/purchases` : null,
  );
  const transfers = useApi<ProductOrderLine[]>(
    nav === "transfer-history" ? `/api/products/${productId}/transfers` : null,
  );
  const inventoryLog = useApi<InventoryEvent[]>(
    nav === "inventory-log" ? `/api/products/${productId}/inventory-log` : null,
  );

  const coreSupplierIdRaw = product?.supplierIds?.[0];
  const coreSupplierId =
    coreSupplierIdRaw !== undefined && coreSupplierIdRaw !== null
      ? String(coreSupplierIdRaw)
      : undefined;
  const coreSupplierName = coreSupplierId
    ? suppliers.data?.items?.find((s) => String(s.id) === coreSupplierId)?.name
    : undefined;

  const taxRateName = taxRates.data?.find((t) => String(t.id) === String(product?.taxRateId))?.name;
  const familyName = families.data?.find((f) => String(f.id) === String(product?.familyId))?.name;

  async function confirmDelete() {
    setDeleteBusy(true);
    setActionError(null);
    try {
      await api.del(`/api/products/${productId}`);
      router.push("/products");
    } catch (e) {
      setShowDeleteConfirm(false);
      setActionError(e instanceof Error ? e.message : "Failed to delete product");
      setDeleteBusy(false);
    }
  }

  return (
    <div className="h-full overflow-auto bg-[var(--oh-surface)] font-sans">
      <div className="px-5 pt-5 md:px-6">
        <button
          type="button"
          onClick={() => router.push("/products")}
          className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--oh-muted)] hover:text-[var(--oh-text)]"
        >
          <ArrowLeftIcon size={16} />
          Back to Products
        </button>
      </div>

      <div className="mx-5 mt-4 rounded-[var(--oh-radius)] bg-[var(--oh-primary)] px-6 py-4 text-center md:mx-6">
        <h1 className="text-[18px] font-semibold text-white md:text-[20px]">
          {product?.name ?? "Product Report"}
        </h1>
      </div>

      <AsyncState loading={loading} error={error} empty={false} onRetry={reloadProduct}>
        {product && (
          <div className="mx-5 mb-6 mt-4 flex flex-col gap-4 lg:mx-6 lg:flex-row">
            <div className="min-w-0 flex-1">
              <AsyncDependencyNotice
                dependencies={[
                  { label: "Tax rates", error: taxRates.error, loading: taxRates.loading, onRetry: taxRates.reload },
                  { label: "Families", error: families.error, loading: families.loading, onRetry: families.reload },
                  { label: "Suppliers", error: suppliers.error, loading: suppliers.loading, onRetry: suppliers.reload },
                ]}
              />
              {nav === "home" && chart.error && (
                <div role="alert" aria-live="assertive" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Sales and purchases chart: {chart.error}</span>
                    <button
                      type="button"
                      onClick={chart.reload}
className="min-h-9 rounded-md border border-[var(--oh-tile-red-border)] bg-[var(--oh-surface-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--oh-danger-text)] hover:bg-[var(--oh-tile-red-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-danger)]"
                    >
                      Retry chart
                    </button>
                  </div>
                </div>
              )}
              {nav === "home" && (
                <ProductHomeReport
                  product={product}
                  taxRateName={taxRateName}
                  familyName={familyName}
                  coreSupplierName={coreSupplierName}
                  coreSupplierId={coreSupplierId}
                  chart={chart.data}
                />
              )}
              {nav === "sales-summary" && (
                <div className="space-y-4">
                  <InfoCard title="Sales & Purchases">
                    <SalesPurchasesChart
                      sales={chart.data?.sales?.length === 12 ? chart.data.sales : EMPTY_YEAR}
                      purchases={chart.data?.purchases?.length === 12 ? chart.data.purchases : EMPTY_YEAR}
                    />
                  </InfoCard>
                  <ActivityTable
                    loading={sales.loading}
                    error={sales.error}
                    empty={(sales.data ?? []).length === 0}
                    emptyText="No sales recorded for this product yet."
                    onRetry={sales.reload}
                    columns={[
                      { label: "Date", width: "w-[180px]" },
                      { label: "Invoice" },
                      { label: "Qty", align: "right" },
                      { label: "Amount", align: "right" },
                    ]}
                    rows={(sales.data ?? []).map((row) => [
                      formatTimestamp(row.soldAt),
                      display(row.invoiceId),
                      String(row.quantity ?? 0),
                      money(row.totalPrice),
                    ])}
                  />
                </div>
              )}
              {nav === "sales-history" && (
                <ActivityTable
                  loading={sales.loading}
                  error={sales.error}
                  empty={(sales.data ?? []).length === 0}
                  emptyText="No sales recorded for this product yet."
                  onRetry={sales.reload}
                  columns={[
                    { label: "Date", width: "w-[180px]" },
                    { label: "Invoice" },
                    { label: "User" },
                    { label: "Qty", align: "right" },
                    { label: "Unit Price", align: "right" },
                    { label: "Amount", align: "right" },
                  ]}
                  rows={(sales.data ?? []).map((row) => [
                    formatTimestamp(row.soldAt),
                    display(row.invoiceId),
                    display(row.userName),
                    String(row.quantity ?? 0),
                    money(row.unitPrice),
                    money(row.totalPrice),
                  ])}
                />
              )}
              {nav === "purchase-history" && (
                <ActivityTable
                  loading={purchases.loading}
                  error={purchases.error}
                  empty={(purchases.data ?? []).length === 0}
                  emptyText="No purchases recorded for this product yet."
                  onRetry={purchases.reload}
                  columns={[
                    { label: "Date", width: "w-[180px]" },
                    { label: "Invoice" },
                    { label: "Status" },
                    { label: "Qty", align: "right" },
                    { label: "Unit Cost", align: "right" },
                  ]}
                  rows={(purchases.data ?? []).map((row) => [
                    formatTimestamp(row.occurredAt),
                    display(row.invoiceNumber || row.reference),
                    display(row.status),
                    String(row.quantity ?? 0),
                    money(row.unitCost),
                  ])}
                />
              )}
              {nav === "transfer-history" && (
                <ActivityTable
                  loading={transfers.loading}
                  error={transfers.error}
                  empty={(transfers.data ?? []).length === 0}
                  emptyText="No transfers recorded for this product yet."
                  onRetry={transfers.reload}
                  columns={[
                    { label: "Date", width: "w-[180px]" },
                    { label: "Reference" },
                    { label: "Status" },
                    { label: "Qty", align: "right" },
                  ]}
                  rows={(transfers.data ?? []).map((row) => [
                    formatTimestamp(row.occurredAt),
                    display(row.reference || row.invoiceNumber),
                    display(row.status),
                    String(row.quantity ?? 0),
                  ])}
                />
              )}
              {nav === "promotions" && (
                <PlaceholderPanel title="Promotions" description="Promotions that apply to this product." />
              )}
              {nav === "revision-history" && (
                <ProductRevisionPanel
                  revisions={revisions.items}
                  loading={revisions.loading}
                  error={revisions.error}
                  onRetry={revisions.reload}
                />
              )}
              {nav === "inventory-log" && (
                <ActivityTable
                  loading={inventoryLog.loading}
                  error={inventoryLog.error}
                  empty={(inventoryLog.data ?? []).length === 0}
                  emptyText="No inventory movements recorded for this product yet."
                  onRetry={inventoryLog.reload}
                  columns={[
                    { label: "Date", width: "w-[180px]" },
                    { label: "Type" },
                    { label: "Reference" },
                    { label: "Qty Change", align: "right" },
                  ]}
                  rows={(inventoryLog.data ?? []).map((row) => [
                    formatTimestamp(row.occurredAt),
                    display(row.type),
                    display(row.reference),
                    String(row.quantity ?? 0),
                  ])}
                />
              )}
            </div>

            <aside className="w-full shrink-0 lg:w-[260px]">
<div className="sticky top-4 space-y-3 rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-3 shadow-[var(--oh-shadow-card)]">
                <button
                  type="button"
                  onClick={() => router.push(`/products/${productId}/edit`)}
                  className="flex w-full items-center justify-center gap-2 rounded-[var(--oh-radius)] bg-[var(--oh-success)] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:opacity-90"
                >
                  <EditIcon size={16} />
                  Edit
                </button>

                <nav className="space-y-0.5">
                  {NAV.map(({ id, label, description, Icon }) => {
                    const active = nav === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setNav(id)}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2.5 text-left transition-colors",
                          active
                            ? "bg-[var(--oh-tile-blue-bg)] text-[var(--oh-tile-blue-text)]"
                            : "text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]",
                        )}
                      >
                        <Icon size={16} className="mt-0.5 shrink-0" strokeWidth={1.75} />
                        <div className="min-w-0">
                          <div className={cn("text-[13px] font-semibold", active && "text-[var(--oh-tile-blue-text)]")}>
                            {label}
                          </div>
                          <div className="mt-0.5 text-[13px] leading-snug text-[var(--oh-muted)]">{description}</div>
                        </div>
                      </button>
                    );
                  })}
                </nav>

                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={deleteBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-[var(--oh-radius)] border border-[var(--oh-danger)] px-4 py-2.5 text-[13px] font-semibold text-[var(--oh-danger)] transition-colors hover:bg-[var(--oh-tile-red-bg)] disabled:opacity-60"
                >
                  <DeleteIcon size={16} />
                  Delete
                </button>
              </div>
            </aside>
          </div>
        )}
      </AsyncState>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Product"
        message={
          product
            ? `Are you sure you want to delete "${product.name}"? This action cannot be undone.`
            : "Are you sure you want to delete this product?"
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleteBusy) setShowDeleteConfirm(false);
        }}
      />
      <AlertDialog
        open={actionError !== null}
        title="Delete failed"
        message={actionError ?? ""}
        variant="danger"
        onClose={() => setActionError(null)}
      />
    </div>
  );
}
