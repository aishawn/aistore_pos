"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi, useApiList } from "@/hooks/useApi";
import { AsyncState } from "@/components/admin/AsyncState";
import type { CustomerDetail } from "@/components/admin/CreateCustomerPage";
import { SelectChevronIcon } from "@/components/icons";

interface PaymentMethod {
  id: string;
  name: string;
}

interface Register {
  id: string;
  name: string;
}

interface Sale {
  id: string;
  invoiceId?: string;
  totalPrice?: number | null;
  outstanding?: number | null;
  createdAt?: string;
  userName?: string;
  registerId?: string;
}

function formatNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatTimestamp(ts?: string) {
  if (!ts) return "—";
  const [datePart = "", timePartRaw = ""] = ts.split("T");
  const time = timePartRaw.slice(0, 8);
  const [y, m, d] = datePart.split("-");
  const date = y && m && d ? `${d}/${m}/${y}` : datePart;
  return time ? `${date} ${time}` : date;
}

function parseTimestamp(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, d, m, y, hh, mm, ss] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${hh.padStart(2, "0")}:${mm}:${ss}`;
}

function money(x?: number | null) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "$0.00";
  return `$${Number(x).toFixed(2)}`;
}

function parseAmount(raw: string): number {
  const trimmed = raw.trim().replace(/^\$/, "");
  if (!trimmed) return 0;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : 0;
}

const fieldClass =
  "h-[52px] w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-[16px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-primary)]";
const labelClass = "mb-1 block text-[16px] text-[var(--oh-text)]";

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export function CustomerMakePaymentPage({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [paymentDate, setPaymentDate] = useState(formatNow);
  const [registerId, setRegisterId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [reference, setReference] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: customer, loading, error: customerError, reload: reloadCustomer } = useApi<CustomerDetail>(
    customerId ? `/api/customers/${customerId}` : null,
  );
  const methods = useApi<PaymentMethod[]>("/api/payment-methods");
  const registers = useApi<Register[]>("/api/registers");
  const sales = useApiList<Sale>("/api/sales", { customerId, page: 1, size: 100 });

  const registerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of registers.data ?? []) {
      map.set(String(r.id), r.name);
    }
    return map;
  }, [registers.data]);

  const outstandingSales = sales.items.filter((s) => Number(s.outstanding ?? 0) > 0);
  const totalAllocated = outstandingSales.reduce(
    (sum, s) => sum + parseAmount(allocations[s.id] ?? ""),
    0,
  );
  const explicitAmount = parseAmount(paymentAmount);
  const effectiveAmount = explicitAmount > 0 ? explicitAmount : totalAllocated;
  const outstanding = Number(customer?.currentOwing ?? 0);
  const unallocated = Math.max(effectiveAmount - totalAllocated, 0);

  const canComplete =
    Boolean(registerId) &&
    Boolean(paymentMethodId) &&
    effectiveAmount > 0 &&
    totalAllocated <= effectiveAmount;

  function setAllocation(saleId: string, value: string) {
    setAllocations((prev) => ({ ...prev, [saleId]: value }));
  }

  async function submit() {
    if (!canComplete) return;
    const timestamp = parseTimestamp(paymentDate);
    if (!timestamp) {
      setError("Enter a valid payment date (dd/mm/yyyy HH:mm:ss).");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payment = await api.post<{ id: string }>("/api/customer-payments", {
        customerId: Number(customerId),
        amount: effectiveAmount,
        paymentMethodId: Number(paymentMethodId),
        registerId: Number(registerId),
        reference: reference.trim() || null,
        timestamp,
      });

      const allocationRows = outstandingSales
        .map((s) => ({
          saleId: Number(s.id),
          amount: parseAmount(allocations[s.id] ?? ""),
        }))
        .filter((a) => a.amount > 0);

      if (allocationRows.length > 0) {
        await api.post(`/api/customer-payments/${payment.id}/allocate`, allocationRows);
      }

      router.push(`/customers/${customerId}/view`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
      setBusy(false);
    }
  }

  const customerName = customer?.name ?? customer?.firstName ?? "Customer";

  return (
    <div className="flex h-full flex-col overflow-auto bg-[var(--oh-surface)] font-sans">
      <div className="px-6 py-6 text-center">
        <h1 className="text-[28px] font-semibold text-[var(--oh-text)]">Make Payment</h1>
        <p className="mx-auto mt-3 max-w-3xl text-[14px] text-[var(--oh-muted)]">
          Please note: if the payment time falls outside a register closure, this payment will not
          appear in any register closure.
        </p>
      </div>

      <AsyncState loading={loading} error={customerError} empty={false} onRetry={reloadCustomer}>
        {customer && (
          <div className="flex min-h-0 flex-1 flex-col px-6 pb-0">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <FormField label="Customer">
                <input readOnly value={customerName} className={`${fieldClass} bg-[var(--oh-surface)]`} />
              </FormField>
              <FormField label="Payment Date">
                <input
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className={fieldClass}
                />
              </FormField>
              <FormField label="Register">
                <div className="relative">
                  <select
                    value={registerId}
                    onChange={(e) => setRegisterId(e.target.value)}
                    className={`${fieldClass} appearance-none pr-10`}
                  >
                    <option value="">Register</option>
                    {(registers.data ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <SelectChevronIcon
                    size={18}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]"
                  />
                </div>
              </FormField>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
              <FormField label="Payment Amount">
                <input
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="$ Payment Amount (optional)"
                  className={fieldClass}
                />
              </FormField>
              <FormField label="Payment Reference">
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Payment Reference (optional)"
                  className={fieldClass}
                />
              </FormField>
              <FormField label="Payment Method">
                <div className="relative">
                  <select
                    value={paymentMethodId}
                    onChange={(e) => setPaymentMethodId(e.target.value)}
                    className={`${fieldClass} appearance-none pr-10`}
                  >
                    <option value="">Payment Method</option>
                    {(methods.data ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <SelectChevronIcon
                    size={18}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]"
                  />
                </div>
              </FormField>
            </div>

            <p className="mt-8 text-[16px] text-[var(--oh-text)]">
              Please fill in the above details before continuing
            </p>
            <p className="mt-2 text-[18px] font-semibold text-[var(--oh-text)]">
              {money(outstanding)} Outstanding and {money(unallocated)} Unallocated
            </p>

            <div className="mt-6 overflow-x-auto rounded-md border border-[var(--oh-border)] text-[15px]">
              <div className="min-w-[670px]">
              <div className="flex bg-[var(--brand-info)] font-semibold text-[var(--brand-on-info)]">
                <div className="w-[170px] border-r border-white/40 px-3 py-3 text-center">Timestamp</div>
                <div className="w-[110px] border-r border-white/40 px-3 py-3 text-center">Invoice</div>
                <div className="w-[100px] border-r border-white/40 px-3 py-3 text-center">User</div>
                <div className="w-[100px] border-r border-white/40 px-3 py-3 text-center">Register</div>
                <div className="w-[90px] border-r border-white/40 px-3 py-3 text-center">Total</div>
                <div className="w-[100px] border-r border-white/40 px-3 py-3 text-center">Outstanding</div>
                <div className="flex-1 px-3 py-3 text-center">Allocation</div>
              </div>
              <AsyncState
                loading={sales.loading}
                error={sales.error}
                empty={outstandingSales.length === 0}
                emptyText="No outstanding invoices for this customer."
                onRetry={sales.reload}
              >
                {outstandingSales.map((s, i) => (
                  <div
                    key={s.id}
                    className={`flex min-w-[670px] items-center border-b border-[var(--oh-border)] last:border-b-0 ${i % 2 === 1 ? "bg-[var(--oh-surface-muted)]" : "bg-[var(--oh-surface-elevated)]"}`}
                  >
                    <div className="w-[170px] border-r border-[var(--oh-border)] px-3 py-3 text-center text-[var(--oh-text)]">
                      {formatTimestamp(s.createdAt)}
                    </div>
                    <div className="w-[110px] border-r border-[var(--oh-border)] px-3 py-3 text-center text-[var(--oh-text)]">
                      {s.invoiceId ?? "—"}
                    </div>
                    <div className="w-[100px] border-r border-[var(--oh-border)] px-3 py-3 text-center text-[var(--oh-text)]">
                      {s.userName ?? "—"}
                    </div>
                    <div className="w-[100px] border-r border-[var(--oh-border)] px-3 py-3 text-center text-[var(--oh-text)]">
                      {s.registerId ? registerMap.get(String(s.registerId)) ?? "Register" : "—"}
                    </div>
                    <div className="w-[90px] border-r border-[var(--oh-border)] px-3 py-3 text-center text-[var(--oh-text)]">
                      {money(s.totalPrice)}
                    </div>
                    <div className="w-[100px] border-r border-[var(--oh-border)] px-3 py-3 text-center text-[var(--oh-text)]">
                      {money(s.outstanding)}
                    </div>
                    <div className="flex flex-1 justify-center px-3 py-2">
                      <div className="relative w-full max-w-[140px]">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]">$</span>
                        <input
                          value={allocations[s.id] ?? ""}
                          onChange={(e) => setAllocation(s.id, e.target.value)}
                          className="h-[40px] w-full rounded border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] pl-7 pr-2 text-[15px] text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)]"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </AsyncState>
              </div>
            </div>

            {error && <p className="mt-4 text-[14px] text-[var(--oh-danger)]">{error}</p>}

            <div className="mt-8 flex h-[56px] items-center justify-between bg-[var(--brand-info)] px-6">
              <button
                type="button"
                onClick={() => router.back()}
                className="rounded border border-[var(--oh-border-strong)] bg-[var(--oh-surface-elevated)] px-8 py-2 text-[16px] text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canComplete || busy}
                className="text-[16px] font-semibold text-white transition-opacity disabled:opacity-50"
              >
                {busy ? "Processing…" : "Complete"}
              </button>
            </div>
          </div>
        )}
      </AsyncState>
    </div>
  );
}
