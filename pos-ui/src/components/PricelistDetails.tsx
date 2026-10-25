"use client";

import { ModalOverlay } from "@/components/ModalOverlay";
import { useEffect, useState } from "react";
import Link from "next/link";
import { OdooRecordLink } from "@/components/OdooRecordLink";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import type { OdooPricelistRecord } from "@/lib/odoo-api";

type Rule = { id: number; product_id: [number, string] | false; product_tmpl_id: [number, string] | false; categ_id: [number, string] | false; min_quantity: number; compute_price: string; fixed_price: number; percent_price: number; date_start: string | false; date_end: string | false };
type Details = { rules: Rule[]; rulesHasNext: boolean; customers: { id: number; name: string }[]; customersHasNext: boolean; customersAvailable: boolean };

export function PricelistDetails({ list, onClose }: { list: OdooPricelistRecord; onClose: () => void }) {
  const [ruleOffset, setRuleOffset] = useState(0);
  const [customerOffset, setCustomerOffset] = useState(0);
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [retry, setRetry] = useState(0);
  useDialogFocus(true, onClose);
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return null;
      setBusy(true); setError(null);
      return fetch(`/api/odoo/pricelists/${list.id}/details?ruleOffset=${ruleOffset}&customerOffset=${customerOffset}`, { cache: "no-store" });
    }).then(async (response) => {
      if (!response || cancelled) return;
      const data = await response.json(); if (!response.ok) throw new Error(data.message || "Could not load price rules");
      if (!cancelled) setDetails(data);
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load price rules"); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [list.id, ruleOffset, customerOffset, retry]);
  return <ModalOverlay className="fixed inset-0 z-[90] flex justify-end bg-slate-950/40"><section role="dialog" aria-modal="true" aria-labelledby="price-details-title" className="h-full w-full max-w-2xl overflow-y-auto bg-white p-4 sm:p-6">
    <button type="button" onClick={onClose} className="min-h-11 rounded border px-3">Close price list</button>
    <h2 id="price-details-title" className="mt-4 text-xl font-semibold">{list.name}</h2><p className="my-3 text-sm text-[var(--oh-muted)]">{list.currency} · Edit pricing rules in Odoo. Customer prices are calculated at checkout.</p>
    <OdooRecordLink model="product.pricelist" id={list.id}>Edit rules in Odoo</OdooRecordLink>
    {busy && <p role="status" className="py-4">Loading details…</p>}
    {error && <p role="alert" className="py-4 text-red-800">{error} <button type="button" onClick={() => setRetry((value) => value + 1)} className="min-h-11 underline">Retry details</button></p>}
    {!busy && !error && details && <>
      <h3 className="mt-6 font-semibold">Price rules</h3>
      {details.rules.length === 0 && <p className="py-4 text-sm">No rules configured. The Odoo base pricing applies.</p>}
      <ul className="mt-3 divide-y rounded-lg border">{details.rules.map((rule) => { const target = rule.product_id || rule.product_tmpl_id || rule.categ_id; return <li key={rule.id} className="grid gap-1 p-3 text-sm"><p className="break-words font-semibold">{target ? target[1] : "All products"}</p><p>{rule.compute_price === "fixed" ? `${list.currency ?? ""} ${rule.fixed_price.toFixed(2)}` : rule.compute_price === "percentage" ? `${rule.percent_price}% discount` : "Advanced Odoo formula"} · minimum {rule.min_quantity} base units</p><p className="text-[var(--oh-muted)]">{rule.date_start || "Any start date"} → {rule.date_end || "No end date"}</p></li>; })}</ul>
      <div className="mt-2 flex justify-between"><button type="button" disabled={ruleOffset === 0} onClick={() => setRuleOffset((value) => Math.max(0, value - 20))} className="min-h-11 disabled:opacity-40">Previous rules</button><button type="button" disabled={!details.rulesHasNext} onClick={() => setRuleOffset((value) => value + 20)} className="min-h-11 disabled:opacity-40">Next rules</button></div>
      <h3 className="mt-6 font-semibold">Assigned customers</h3>
      {!details.customersAvailable ? <p className="py-4 text-sm">Customer view permission is required.</p> : <><ul className="divide-y">{details.customers.map((customer) => <li key={customer.id}><Link href={`/customers/odoo?q=${encodeURIComponent(customer.name)}&pricelistId=${list.id}`} className="flex min-h-11 items-center text-sm text-[var(--oh-primary)]">{customer.name}</Link></li>)}</ul>{details.customers.length === 0 && <p className="py-4 text-sm">No customers assigned.</p>}<div className="flex justify-between"><button type="button" disabled={customerOffset === 0} onClick={() => setCustomerOffset((value) => Math.max(0, value - 20))} className="min-h-11 disabled:opacity-40">Previous customers</button><button type="button" disabled={!details.customersHasNext} onClick={() => setCustomerOffset((value) => value + 20)} className="min-h-11 disabled:opacity-40">Next customers</button></div></>}
    </>}
  </section></ModalOverlay>;
}
