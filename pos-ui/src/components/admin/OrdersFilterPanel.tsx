"use client";

import { useState } from "react";
import { AsyncDependencyNotice } from "@/components/admin/AsyncState";
import { FormDatePicker } from "@/components/admin/FormDatePicker";
import { FilterSelect } from "@/components/admin/FilterSelect";
import { useApi } from "@/hooks/useApi";

interface Named {
  id: string;
  name: string;
}

export interface OrderFilters {
  status: string;
  type: string;
  invoiceNumber: string;
  orderDate: string;
  dueDate: string;
  reference: string;
  supplierId: string;
  transferorId: string;
  outletId: string;
  productId: string;
  createdById: string;
  sentById: string;
  receivedById: string;
}

export const DEFAULT_ORDER_FILTERS: OrderFilters = {
  status: "OUTSTANDING",
  type: "",
  invoiceNumber: "",
  orderDate: "",
  dueDate: "",
  reference: "",
  supplierId: "",
  transferorId: "",
  outletId: "",
  productId: "",
  createdById: "",
  sentById: "",
  receivedById: "",
};

export function orderFiltersToQuery(filters: OrderFilters): Record<string, string | undefined> {
  return {
    status: filters.status || undefined,
    type: filters.type || undefined,
    invoiceNumber: filters.invoiceNumber || undefined,
    orderDate: filters.orderDate || undefined,
    dueDate: filters.dueDate || undefined,
    reference: filters.reference || undefined,
    supplierId: filters.supplierId || undefined,
    transferorId: filters.transferorId || undefined,
    outletId: filters.outletId || undefined,
    productId: filters.productId || undefined,
    createdById: filters.createdById || undefined,
    sentById: filters.sentById || undefined,
    receivedById: filters.receivedById || undefined,
  };
}

const labelClass = "mb-1 text-xs font-medium text-[var(--oh-text-secondary)]";
const inputClass =
  "min-h-10 w-full rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15";
const fieldClass = "flex min-w-0 flex-col";
const basicGridClass =
  "grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7";
const advancedGridClass =
  "grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6";

function FilterInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className={fieldClass}>
      <span className={labelClass}>{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </label>
  );
}

function FilterDateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className={fieldClass}>
      <span className={labelClass}>{label}</span>
      <div className="[&_button]:min-h-10 [&_button]:rounded-lg [&_button]:border-[var(--oh-border)] [&_button]:bg-white [&_button]:px-3 [&_button]:text-sm [&_button]:focus:border-[var(--oh-primary)] [&_button]:focus:ring-2 [&_button]:focus:ring-[var(--oh-primary)]/15">
        <FormDatePicker value={value} onChange={onChange} ariaLabel={label} placeholder="DD/MM/YYYY" compact />
      </div>
    </label>
  );
}

const STATUS_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Outstanding", value: "OUTSTANDING" },
  { label: "Open", value: "OPEN" },
  { label: "Sent", value: "SENT" },
  { label: "Partially received", value: "PARTIALLY_RECEIVED" },
  { label: "Received", value: "RECEIVED" },
  { label: "Cancelled", value: "CANCELLED" },
];

const TYPE_OPTIONS = [
  { label: "Order", value: "ORDER" },
  { label: "Transfer", value: "TRANSFER" },
  { label: "Credit", value: "CREDIT" },
  { label: "Return", value: "RETURN" },
  { label: "Receive", value: "RECEIVE" },
];

const toOptions = (rows?: Array<{ id: string | number; name: string }> | null) =>
  (rows ?? []).map((r) => ({ label: r.name, value: String(r.id) }));

export function OrdersFilterPanel({
  filters,
  onChange,
  onFilter,
  hideType = false,
  filtering = false,
}: {
  filters: OrderFilters;
  onChange: (filters: OrderFilters) => void;
  onFilter: () => void;
  /** Purchase Orders tab always scopes to ORDER; hide the Type control. */
  hideType?: boolean;
  filtering?: boolean;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const suppliers = useApi<{ items: Named[] }>("/api/suppliers", { size: 200 });
  const transferees = useApi<Named[]>("/api/transferees");
  const outlets = useApi<Named[]>("/api/outlets");
  const products = useApi<{ items: Named[] }>("/api/products", { size: 200 });
  const users = useApi<Named[]>("/api/users");

  const set = <K extends keyof OrderFilters>(key: K, value: OrderFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div>
      <AsyncDependencyNotice
        dependencies={[
          { label: "Suppliers", error: suppliers.error, loading: suppliers.loading, onRetry: suppliers.reload },
          { label: "Transferees", error: transferees.error, loading: transferees.loading, onRetry: transferees.reload },
          { label: "Outlets", error: outlets.error, loading: outlets.loading, onRetry: outlets.reload },
          { label: "Products", error: products.error, loading: products.loading, onRetry: products.reload },
          { label: "Users", error: users.error, loading: users.loading, onRetry: users.reload },
        ]}
      />
      <div className={basicGridClass}>
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(v) => set("status", v)}
          options={STATUS_OPTIONS}
          placeholder="All statuses"
        />
        {!hideType && (
          <FilterSelect
            label="Type"
            value={filters.type}
            onChange={(v) => set("type", v)}
            options={TYPE_OPTIONS}
            placeholder="All"
          />
        )}
        <FilterInput label="Invoice Number" value={filters.invoiceNumber} onChange={(v) => set("invoiceNumber", v)} />
        <FilterDateInput
          label="Order / Invoice Date"
          value={filters.orderDate}
          onChange={(v) => set("orderDate", v)}
        />
        <FilterDateInput label="Due Date" value={filters.dueDate} onChange={(v) => set("dueDate", v)} />
        <FilterInput label="Reference" value={filters.reference} onChange={(v) => set("reference", v)} />
        <FilterSelect
          label="Supplier"
          value={filters.supplierId}
          onChange={(v) => set("supplierId", v)}
          options={toOptions(suppliers.data?.items)}
        />
      </div>

      {advancedOpen && (
        <div className={`${advancedGridClass} mt-4 border-t border-[var(--oh-border)] pt-4`}>
          <FilterSelect
            label="Transferee"
            value={filters.transferorId}
            onChange={(v) => set("transferorId", v)}
            options={toOptions(transferees.data)}
          />
          <FilterSelect
            label="Outlet"
            value={filters.outletId}
            onChange={(v) => set("outletId", v)}
            options={toOptions(outlets.data)}
          />
          <FilterSelect
            label="Product"
            value={filters.productId}
            onChange={(v) => set("productId", v)}
            options={toOptions(products.data?.items)}
          />
          <FilterSelect
            label="Created By"
            value={filters.createdById}
            onChange={(v) => set("createdById", v)}
            options={toOptions(users.data)}
          />
          <FilterSelect
            label="Sent By"
            value={filters.sentById}
            onChange={(v) => set("sentById", v)}
            options={toOptions(users.data)}
          />
          <FilterSelect
            label="Received By"
            value={filters.receivedById}
            onChange={(v) => set("receivedById", v)}
            options={toOptions(users.data)}
          />
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="inline-flex min-h-10 items-center rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
        >
          {advancedOpen ? "Hide advanced filters" : "Show advanced filters"}
        </button>
        <button
          type="button"
          onClick={onFilter}
          disabled={filtering}
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--oh-primary)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60"
        >
          {filtering ? "Filtering…" : "Filter"}
        </button>
      </div>
    </div>
  );
}

export function purchaseOrderFiltersActive(filters: OrderFilters): boolean {
  const f = filters;
  return (
    f.status !== DEFAULT_ORDER_FILTERS.status ||
    f.invoiceNumber.trim() !== "" ||
    f.orderDate !== "" ||
    f.dueDate !== "" ||
    f.reference.trim() !== "" ||
    f.supplierId !== "" ||
    f.transferorId !== "" ||
    f.outletId !== "" ||
    f.productId !== "" ||
    f.createdById !== "" ||
    f.sentById !== "" ||
    f.receivedById !== ""
  );
}
