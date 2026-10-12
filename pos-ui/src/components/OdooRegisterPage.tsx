"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, CircleAlert, LoaderCircle, Minus, Plus, RefreshCw, Search, Trash2, UserRound, Wine } from "lucide-react";
import {
  getOdooPosBootstrap,
  getOdooSession,
  searchOdooRecords,
  submitOdooPosOrder,
  type OdooCustomerRecord,
  type OdooPosBootstrap,
  type OdooProductRecord,
} from "@/lib/odoo-api";

type CartLine = { product: OdooProductRecord; quantity: number };

const money = (amount: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);

function roundedTotal(amount: number, increment: number, method: "UP" | "DOWN" | "HALF-UP") {
  if (!(increment > 0)) return amount;
  const ratio = amount / increment;
  const count = method === "UP"
    ? Math.ceil(ratio - 1e-9)
    : method === "DOWN"
      ? Math.floor(ratio + 1e-9)
      : Math.floor(ratio + 0.5 + 1e-9);
  return Math.round(count * increment * 100) / 100;
}

export function OdooRegisterPage() {
  const [bootstrap, setBootstrap] = useState<OdooPosBootstrap | null>(null);
  const [configId, setConfigId] = useState<number | null>(null);
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<OdooProductRecord[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [customers, setCustomers] = useState<OdooCustomerRecord[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customer, setCustomer] = useState<OdooCustomerRecord | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ reference: string; total: number; gst: number } | null>(null);
  const orderUuid = useRef<string | null>(null);
  const checkoutFingerprint = useRef<string | null>(null);
  const searchRevision = useRef(0);
  const barcodeLookupBusy = useRef(false);

  const loadPos = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const user = await getOdooSession();
      setConnected(Boolean(user));
      if (!user) {
        setBootstrap(null);
        return;
      }
      const data = await getOdooPosBootstrap();
      setBootstrap(data);
      const active = data.configs.find((item) => item.session) ?? data.configs[0];
      setConfigId((current) => current && data.configs.some((item) => item.id === current) ? current : active?.id ?? null);
      const selected = active?.paymentMethods[0]?.id ?? null;
      setPaymentMethodId((current) => current && active?.paymentMethods.some((item) => item.id === current) ? current : selected);
      if (data.message) setError(data.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the Odoo register.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadPos(true); }, [loadPos]);

  useEffect(() => {
    const revision = ++searchRevision.current;
    const timer = window.setTimeout(async () => {
      if (!connected) return;
      setProductsLoading(true);
      try {
        const result = await searchOdooRecords<OdooProductRecord>("products", { query, limit: 50 });
        if (revision === searchRevision.current) setProducts(result.items);
      } catch (cause) {
        if (revision === searchRevision.current) setError(cause instanceof Error ? cause.message : "Product search failed.");
      } finally {
        if (revision === searchRevision.current) setProductsLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, connected]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (!connected || !customerQuery.trim()) {
        setCustomers([]);
        return;
      }
      try {
        const result = await searchOdooRecords<OdooCustomerRecord>("customers", { query: customerQuery, limit: 12 });
        setCustomers(result.items);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Customer search failed.");
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [customerQuery, connected]);

  const selectedConfig = bootstrap?.configs.find((item) => item.id === configId) ?? null;
  const paymentMethods = selectedConfig?.paymentMethods ?? [];
  const total = useMemo(() => Math.round(lines.reduce((sum, line) => sum + line.product.list_price * line.quantity, 0) * 100) / 100, [lines]);
  const selectedPayment = paymentMethods.find((method) => method.id === paymentMethodId);
  const applyRounding = Boolean(selectedConfig?.cashRounding && (!selectedConfig.onlyRoundCashMethod || selectedPayment?.is_cash_count));
  const amountToCollect = applyRounding && selectedConfig?.cashRounding
    ? roundedTotal(total, selectedConfig.cashRounding.rounding, selectedConfig.cashRounding.rounding_method)
    : total;
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);

  function addProduct(product: OdooProductRecord) {
    setLines((current) => {
      const found = current.find((line) => line.product.id === product.id);
      return found
        ? current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { product, quantity: 1 }];
    });
  }

  async function handleProductSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || barcodeLookupBusy.current || !query.trim()) return;
    event.preventDefault();
    barcodeLookupBusy.current = true;
    setError(null);
    try {
      // Barcode scanners usually send Enter after the final character. Search
      // immediately instead of relying on the debounced text search response.
      const result = await searchOdooRecords<OdooProductRecord>("products", { query: query.trim(), limit: 50 });
      const needle = query.trim().toLocaleLowerCase();
      const matches = result.items.filter((product) =>
        [product.barcode, product.default_code]
          .filter((value): value is string => typeof value === "string")
          .some((value) => value.trim().toLocaleLowerCase() === needle),
      );
      if (matches.length === 1) {
        addProduct(matches[0]);
        setQuery("");
        return;
      }
      setError(matches.length > 1
        ? "More than one product uses this barcode or code. Search and select the correct product."
        : `No product matches barcode or code “${query.trim()}”.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Barcode lookup failed.");
    } finally {
      barcodeLookupBusy.current = false;
    }
  }

  function changeQuantity(productId: number, amount: number) {
    setLines((current) => current
      .map((line) => line.product.id === productId ? { ...line, quantity: line.quantity + amount } : line)
      .filter((line) => line.quantity > 0));
  }

  async function checkout() {
    if (!selectedConfig?.session || !paymentMethodId || !lines.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const fingerprint = JSON.stringify({
        configId: selectedConfig.id,
        paymentMethodId,
        customerId: customer?.id ?? null,
        lines: lines.map((line) => [line.product.id, line.quantity]),
      });
      if (!orderUuid.current || checkoutFingerprint.current !== fingerprint) {
        orderUuid.current = crypto.randomUUID();
        checkoutFingerprint.current = fingerprint;
      }
      const stableOrderUuid = orderUuid.current ?? crypto.randomUUID();
      orderUuid.current = stableOrderUuid;
      const result = await submitOdooPosOrder({
        configId: selectedConfig.id,
        paymentMethodId,
        orderUuid: stableOrderUuid,
        customerId: customer?.id ?? null,
        tendered: amountToCollect,
        lines: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
      });
      setReceipt({ reference: result.receipt, total: result.total, gst: result.gst });
      setLines([]);
      setCustomer(null);
      setCustomerQuery("");
      orderUuid.current = null;
      checkoutFingerprint.current = null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Odoo could not confirm the sale. Keep this order open and retry only after checking sales history.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="grid h-full place-items-center bg-[var(--oh-surface)]"><LoaderCircle className="animate-spin text-[var(--oh-muted)]" /></div>;
  if (!connected) return (
    <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
      <section className="max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-7 text-center shadow-[var(--oh-shadow-card)]">
        <CircleAlert className="mx-auto text-amber-600" size={30} />
        <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Connect Odoo to open the register</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Sign in with your Odoo staff account in Integrations first. This register reads products, customers, sessions and payments from Odoo.</p>
        <Link href="/settings/integrations" className="mt-5 inline-flex h-10 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Connect Odoo</Link>
      </section>
    </main>
  );

  return (
    <main className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)] p-3 md:p-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--oh-text)]">Sell</h1>
          <p className="mt-0.5 text-xs text-[var(--oh-muted)]">Odoo register · {selectedConfig?.name ?? "Choose a register"}{selectedConfig?.session ? ` · ${selectedConfig.session.name}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <select aria-label="Register" value={configId ?? ""} onChange={(event) => {
            const id = Number(event.target.value);
            setConfigId(id);
            const config = bootstrap?.configs.find((item) => item.id === id);
            setPaymentMethodId(config?.paymentMethods[0]?.id ?? null);
          }} className="h-10 max-w-[220px] rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]">
            {bootstrap?.configs.map((config) => <option key={config.id} value={config.id}>{config.name}{config.session ? "" : " · Closed"}</option>)}
          </select>
          <button type="button" onClick={() => void loadPos()} disabled={refreshing} title="Refresh register data" className="grid h-10 w-10 place-items-center rounded-md border border-[var(--oh-border)] bg-white text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-60">
            {refreshing ? <LoaderCircle size={17} className="animate-spin" /> : <RefreshCw size={17} />}
          </button>
        </div>
      </header>

      {!selectedConfig?.session && <div role="status" className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">This register has no open session. Open a session in Odoo, then refresh.</div>}
      {error && <div role="alert" className="mb-3 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"><span>{error}</span><button onClick={() => setError(null)} aria-label="Dismiss" className="font-bold">×</button></div>}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
          <label className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--oh-border)] px-3">
            <Search size={18} className="text-[var(--oh-muted)]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => void handleProductSearchKeyDown(event)} placeholder="Scan barcode or search products" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--oh-placeholder)]" />
            {productsLoading && <LoaderCircle size={16} className="animate-spin text-[var(--oh-muted)]" />}
          </label>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {products.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => <button key={product.id} type="button" onClick={() => addProduct(product)} disabled={!selectedConfig?.session} className="flex min-h-[82px] items-center gap-3 rounded-md border border-[var(--oh-border)] p-3 text-left transition-colors hover:border-[var(--sf-link-blue)] hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-sky-50 text-[var(--sf-tab-blue)]"><Wine size={19} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-[var(--oh-text)]">{product.display_name || product.name}</span><span className="mt-1 block text-sm font-semibold text-[var(--oh-text)]">{money(product.list_price)}</span><span className={`mt-0.5 block text-xs ${product.qty_available > 0 ? "text-[var(--oh-muted)]" : "font-medium text-amber-700"}`}>{product.qty_available > 0 ? `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(product.qty_available)} available` : "No stock on hand"}</span></span>
                <Plus size={17} className="shrink-0 text-[var(--sf-tab-blue)]" />
              </button>)}
            </div> : <div className="grid h-full place-items-center text-center text-sm text-[var(--oh-muted)]">{productsLoading ? "Loading products…" : "No POS products found. Search by name, barcode or code."}</div>}
          </div>
        </section>

        <section className="flex min-h-[400px] flex-col overflow-hidden rounded-lg border border-black bg-white">
          <div className="flex min-h-[64px] shrink-0 items-center gap-2 border-b border-black px-4">
            <UserRound size={18} className="text-[var(--oh-muted)]" />
            {customer ? <><span className="flex-1 text-sm font-semibold text-[var(--oh-text)]">{customer.name}</span><button type="button" onClick={() => setCustomer(null)} className="text-xs font-medium text-[var(--sf-link-blue)]">Remove</button></> : <input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="Add customer (optional)" className="h-10 min-w-0 flex-1 text-sm outline-none placeholder:text-[var(--oh-muted)]" />}
          </div>
          {!customer && customers.length > 0 && <div className="max-h-36 shrink-0 overflow-y-auto border-b border-[var(--oh-border)]">{customers.map((item) => <button key={item.id} type="button" onClick={() => { setCustomer(item); setCustomers([]); setCustomerQuery(""); }} className="block w-full border-b border-[var(--oh-border)] px-4 py-2 text-left text-sm hover:bg-sky-50">{item.name}<span className="ml-2 text-xs text-[var(--oh-muted)]">{item.phone || item.email}</span></button>)}</div>}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {lines.length ? lines.map(({ product, quantity: qty }) => <div key={product.id} className="flex items-center gap-3 border-b border-[#eee] px-4 py-3">
              <span className="w-6 text-sm text-[var(--oh-muted)]">{qty}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-[var(--oh-text)]">{product.display_name || product.name}</span><span className="text-xs text-[var(--oh-muted)]">{money(product.list_price)} each</span></span>
              <span className="text-sm font-medium">{money(product.list_price * qty)}</span>
              <div className="flex items-center gap-1"><button aria-label={`Decrease ${product.name}`} onClick={() => changeQuantity(product.id, -1)} className="grid h-8 w-8 place-items-center rounded border border-[var(--oh-border)]"><Minus size={14} /></button><button aria-label={`Increase ${product.name}`} onClick={() => changeQuantity(product.id, 1)} className="grid h-8 w-8 place-items-center rounded border border-[var(--oh-border)]"><Plus size={14} /></button><button aria-label={`Remove ${product.name}`} onClick={() => setLines((current) => current.filter((line) => line.product.id !== product.id))} className="grid h-8 w-8 place-items-center text-[var(--oh-muted)] hover:text-red-600"><Trash2 size={15} /></button></div>
            </div>) : <div className="grid h-full place-items-center px-6 text-center"><div><Wine size={24} className="mx-auto text-[var(--oh-muted)]" /><p className="mt-2 text-sm text-[var(--oh-muted)]">Add a product to start a sale</p></div></div>}
          </div>
          <div className="shrink-0 border-t border-[var(--oh-border)] p-4">
            <div className="mb-3 flex items-end justify-between"><div><p className="text-xs text-[var(--oh-muted)]">{quantity} {quantity === 1 ? "item" : "items"}</p><p className="mt-1 text-xs text-[var(--oh-muted)]">GST included where configured in Odoo</p>{amountToCollect !== total && <p className="mt-1 text-xs font-medium text-[var(--oh-muted)]">Cash rounding {money(amountToCollect - total)}</p>}</div><div className="text-right"><p className="text-xs uppercase tracking-wide text-[var(--oh-muted)]">Total</p><p className="text-3xl font-semibold tabular-nums text-[var(--oh-text)]">{money(amountToCollect)}</p></div></div>
            <div className="mb-3 grid grid-cols-[1fr_1.3fr] gap-2"><label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Payment method<select value={paymentMethodId ?? ""} onChange={(event) => setPaymentMethodId(Number(event.target.value) || null)} disabled={!paymentMethods.length} className="h-10 rounded-md border border-[var(--oh-border)] bg-white px-2 text-sm font-medium normal-case tracking-normal text-[var(--oh-text)]">{paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label><div className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Sale details<div className="flex h-10 items-center rounded-md bg-[var(--oh-surface)] px-3 text-sm font-medium normal-case tracking-normal text-[var(--oh-text)]">{selectedConfig?.session?.name ?? "No open session"}</div></div></div>
            <button type="button" onClick={() => void checkout()} disabled={!lines.length || !selectedConfig?.session || !paymentMethodId || busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--sf-link-blue)] text-lg font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-[#bdbdbd]">
              {busy ? <><LoaderCircle size={18} className="animate-spin" /> Processing…</> : <>Finalise · {money(amountToCollect)}</>}
            </button>
          </div>
        </section>
      </div>

      {receipt && <div role="dialog" aria-modal="true" aria-labelledby="sale-complete-title" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
        <section className="w-full max-w-sm rounded-xl bg-white p-7 text-center shadow-2xl">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-700"><Check size={24} /></span>
          <h2 id="sale-complete-title" className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Sale complete</h2>
          <p className="mt-2 text-sm text-[var(--oh-muted)]">Receipt {receipt.reference}</p>
          <p className="mt-3 text-3xl font-semibold">{money(receipt.total)}</p>
          <p className="mt-1 text-xs text-[var(--oh-muted)]">GST {money(receipt.gst)} · {selectedConfig?.session?.name}</p>
          <button onClick={() => setReceipt(null)} className="mt-6 h-11 w-full rounded-md bg-[var(--oh-primary)] text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">New sale</button>
        </section>
      </div>}
    </main>
  );
}
