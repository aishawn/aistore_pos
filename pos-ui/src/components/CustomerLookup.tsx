"use client";
import { useEffect, useState } from "react";
import { getOdooCustomerGroups, getOdooPricelists } from "@/lib/odoo-api";
import { useDebouncedValue } from "@/hooks/useApi";

export function CustomerLookup({ kind, values, onChange, multiple = false, label, initialOptions = [] }: {
  kind: "groups" | "pricelists"; values: number[]; onChange: (values: number[]) => void;
  multiple?: boolean; label: string; initialOptions?: { id: number; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const search = useDebouncedValue(query, 250);
  const [offset, setOffset] = useState(0);
  const [options, setOptions] = useState<{ id: number; name: string }[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load: (query: string, offset: number, limit: number) => Promise<{ items: { id: number; name: string }[]; hasNext: boolean }> = kind === "groups" ? getOdooCustomerGroups : getOdooPricelists;
    void Promise.resolve().then(() => {
      if (cancelled) return null;
      setBusy(true); setError(null);
      return load(search, offset, 20);
    }).then((page) => {
      if (!cancelled && page) { setOptions(page.items); setHasNext(page.hasNext); }
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load choices"); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [kind, search, offset, retry]);
  const pending = busy || query !== search;
  const selectedOptions = values.map((id) => options.find((item) => item.id === id) ?? initialOptions.find((item) => item.id === id) ?? { id, name: `Selected #${id}` });
  return <fieldset className="grid min-w-0 gap-2 rounded-lg border border-[var(--oh-border)] p-3 text-sm">
    <legend className="px-1 font-medium">{label}</legend>
    <input aria-label={`Search ${label.toLowerCase()}`} value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} placeholder="Search choices…" className="h-11 min-w-0 rounded-md border border-[var(--oh-border)] px-3" />
    {multiple ? <>
      {selectedOptions.length > 0 && <div className="flex flex-wrap gap-1">{selectedOptions.map((item) => <button key={item.id} type="button" onClick={() => onChange(values.filter((id) => id !== item.id))} aria-label={`Remove ${item.name}`} className="min-h-11 rounded border px-2">{item.name} ×</button>)}</div>}
      <div className="max-h-44 overflow-auto">{options.map((item) => <label key={item.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={pending || Boolean(error)} checked={values.includes(item.id)} onChange={() => onChange(values.includes(item.id) ? values.filter((id) => id !== item.id) : [...values, item.id])} />{item.name}</label>)}</div>
    </> : <select aria-label={label} disabled={pending || Boolean(error)} value={values[0] ?? ""} onChange={(event) => onChange(event.target.value ? [Number(event.target.value)] : [])} className="h-11 min-w-0 max-w-full rounded-md border border-[var(--oh-border)] bg-white px-2">
      <option value="">All / default</option>
      {[...selectedOptions, ...options.filter((item) => !values.includes(item.id))].map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>}
    {error ? <p role="alert">{error} <button type="button" onClick={() => setRetry((value) => value + 1)} className="min-h-11 underline">Retry choices</button></p> : <div className="flex items-center justify-between gap-2"><button type="button" disabled={offset === 0 || pending} onClick={() => setOffset((value) => Math.max(0, value - 20))} className="min-h-11 disabled:opacity-40">Previous choices</button><span aria-live="polite">{pending ? "Loading…" : `Page ${offset / 20 + 1}`}</span><button type="button" disabled={!hasNext || pending} onClick={() => setOffset((value) => value + 20)} className="min-h-11 disabled:opacity-40">More choices</button></div>}
  </fieldset>;
}
