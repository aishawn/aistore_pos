"use client";

import { ModalOverlay } from "@/components/ModalOverlay";
import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { api, type Page } from "@/lib/api";
import type { RetailPricelistRecord } from "@/lib/retail-api";

type PriceListDetail = {
  id: number;
  name: string;
  items?: Array<{
    id?: number;
    itemId?: number | null;
    amount?: number | null;
    rule?: string | null;
    classificationType?: string | null;
  }>;
};

export function PricelistDetails({ list, onClose }: { list: RetailPricelistRecord; onClose: () => void }) {
  const [customerOffset, setCustomerOffset] = useState(0);
  const [detail, setDetail] = useState<PriceListDetail | null>(null);
  const [customers, setCustomers] = useState<Array<{ id: number; name: string }>>([]);
  const [customersHasNext, setCustomersHasNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [retry, setRetry] = useState(0);
  useDialogFocus(true, onClose);
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    void Promise.all([
      api.get<PriceListDetail>(`/api/price-lists/${list.id}`),
      api.get<Page<{ id: number; name: string }>>("/api/customers", {
        page: Math.floor(customerOffset / 20) + 1,
        size: 20,
        priceListId: list.id,
      }),
    ])
      .then(([priceList, customerPage]) => {
        if (cancelled) return;
        setDetail(priceList);
        setCustomers(customerPage.items.map((customer) => ({ id: Number(customer.id), name: customer.name })));
        setCustomersHasNext((Math.floor(customerOffset / 20) + 1) * 20 < customerPage.total);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load price rules");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [list.id, customerOffset, retry]);
  const rules = detail?.items ?? [];
  return (
    <ModalOverlay className="fixed inset-0 z-[90] flex justify-end bg-slate-950/40">
      <section role="dialog" aria-modal="true" aria-labelledby="price-details-title" className="h-full w-full max-w-2xl overflow-y-auto bg-white p-4 sm:p-6">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="price-details-title" className="text-xl font-semibold">{list.name}</h2>
            <p className="mt-3 text-sm text-[var(--oh-muted)]">{list.currency || "AUD"} · Orithos price list rules and assigned customers.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><X size={18} /></button>
        </header>
        {busy && <p role="status" className="py-4">Loading details…</p>}
        {error && (
          <p role="alert" className="py-4 text-red-800">
            {error}{" "}
            <button type="button" onClick={() => setRetry((value) => value + 1)} className="min-h-11 underline">Retry details</button>
          </p>
        )}
        {!busy && !error && detail && (
          <>
            <h3 className="mt-6 font-semibold">Price rules</h3>
            {rules.length === 0 && <p className="py-4 text-sm">No rules configured. Orithos shelf prices apply.</p>}
            <ul className="mt-3 divide-y rounded-lg border">
              {rules.map((rule, index) => (
                <li key={rule.id ?? index} className="grid gap-1 p-3 text-sm">
                  <p className="break-words font-semibold">
                    {rule.itemId ? `Product #${rule.itemId}` : rule.classificationType || "All products"}
                  </p>
                  <p>
                    {list.currency ?? "AUD"} {Number(rule.amount ?? 0).toFixed(2)}
                    {rule.rule ? ` · ${rule.rule}` : ""}
                  </p>
                </li>
              ))}
            </ul>
            <h3 className="mt-6 font-semibold">Assigned customers</h3>
            <ul className="divide-y">
              {customers.map((customer) => (
                <li key={customer.id}>
                  <Link href={`/customers?q=${encodeURIComponent(customer.name)}&pricelistId=${list.id}`} className="flex min-h-11 items-center text-sm text-[var(--oh-primary)]">
                    {customer.name}
                  </Link>
                </li>
              ))}
            </ul>
            {customers.length === 0 && <p className="py-4 text-sm">No customers assigned.</p>}
            <div className="flex justify-between">
              <button type="button" disabled={customerOffset === 0} onClick={() => setCustomerOffset((value) => Math.max(0, value - 20))} className="min-h-11 disabled:opacity-40">Previous customers</button>
              <button type="button" disabled={!customersHasNext} onClick={() => setCustomerOffset((value) => value + 20)} className="min-h-11 disabled:opacity-40">Next customers</button>
            </div>
          </>
        )}
      </section>
    </ModalOverlay>
  );
}
