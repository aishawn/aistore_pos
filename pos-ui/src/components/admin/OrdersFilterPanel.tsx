"use client";

import { AdminPrimaryButton } from "@/components/admin/AdminPageLayout";
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

const labelClass = "mb-0.5 text-[12px] font-medium text-[var(--oh-text-secondary)]";
const inputClass =
  "h-8 w-full rounded-md border border-[var(--oh-border)] bg-white px-2.5 text-[13px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]";
const fieldClass = "flex min-w-0 flex-col font-sans";
const filterGridClass =
  "grid grid-cols-[repeat(4,minmax(0,1fr))] gap-x-5 gap-y-5";

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
      <div className="[&_button]:h-8 [&_button]:rounded-md [&_button]:px-2.5 [&_button]:text-[13px]">
        <FormDatePicker value={value} onChange={onChange} placeholder="DD/MM/YYYY" compact />
      </div>
    </label>
  );
}

const STATUS_OPTIONS = [
  { label: "Outstanding", value: "OUTSTANDING" },
  { label: "Open", value: "OPEN" },
  { label: "Sent", value: "SENT" },
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
}: {
  filters: OrderFilters;
  onChange: (filters: OrderFilters) => void;
  onFilter: () => void;
}) {
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
      <div className={filterGridClass}>
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(v) => set("status", v)}
          options={STATUS_OPTIONS}
          placeholder="All"
        />
        <FilterSelect
          label="Type"
          value={filters.type}
          onChange={(v) => set("type", v)}
          options={TYPE_OPTIONS}
          placeholder="All"
        />
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
        <FilterSelect
          label="Transferor"
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

      <div className="mt-6 flex items-center justify-end">
        <AdminPrimaryButton onClick={onFilter}>Filter</AdminPrimaryButton>
      </div>
    </div>
  );
}
