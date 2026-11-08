"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, Plus, RefreshCw, ShoppingBasket, X } from "lucide-react";
import {
  browseProducts,
  checkoutSale,
  getRetailRegisterSession,
  listRetailRegisters,
  openRetailRegisterSession,
  quoteSale,
  type CheckoutPayload,
  type CheckoutQuote,
  type ProductBrowseItem,
  type RetailRegister,
  type RetailRegisterSession,
} from "@/lib/api";
import { ApiError } from "@/lib/api";

type CartLine = { product: ProductBrowseItem; quantity: number };
type Receipt = { reference: string; total: number; gst: number; change: number; lines: CartLine[] };
type CheckoutAttempt = { key: string; payload: CheckoutPayload; lines: CartLine[] };
const PENDING_CHECKOUT_KEY = "orithos.native-checkout.pending.v1";

const money = (amount: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);

function NativeOrithosRegisterPage() {
  const [registers, setRegisters] = useState<RetailRegister[]>([]);
  const [registerId, setRegisterId] = useState<number | null>(null);
  const [session, setSession] = useState<RetailRegisterSession | null>(null);
  const [products, setProducts] = useState<ProductBrowseItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quotedFingerprint, setQuotedFingerprint] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openingFloat, setOpeningFloat] = useState("0.00");
  const [cashTendered, setCashTendered] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkoutRecovery, setCheckoutRecovery] = useState(false);
  const [openAttemptPending, setOpenAttemptPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productsRevision, setProductsRevision] = useState(0);
  const openAttemptKey = useRef<string | null>(null);
  const checkoutAttempt = useRef<CheckoutAttempt | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await listRetailRegisters();
      setRegisters(rows);
      const selected = rows.find((item) => item.id === registerId) ?? rows[0] ?? null;
      setRegisterId(selected?.id ?? null);
      if (selected) setSession(await getRetailRegisterSession(selected.id));
      else setSession(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Orithos could not load the register.");
    } finally {
      setLoading(false);
    }
  }, [registerId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const value = JSON.parse(sessionStorage.getItem(PENDING_CHECKOUT_KEY) ?? "null") as Partial<CheckoutAttempt> | null;
        if (!value || typeof value.key !== "string" || !value.payload || !Array.isArray(value.payload.items)
            || !Array.isArray(value.lines) || typeof value.payload.registerId !== "number"
            || !Number.isSafeInteger(value.payload.registerId)) return;
        const lines = value.lines as CartLine[];
        if (!lines.every((line) => line?.product && typeof line.product.id === "string"
            && typeof line.product.name === "string" && Number.isFinite(line.product.price)
            && Number.isFinite(line.quantity) && line.quantity > 0)) return;
        checkoutAttempt.current = value as CheckoutAttempt;
        setCart(lines);
        setRegisterId(value.payload.registerId);
        setCheckoutRecovery(true);
      } catch { /* Ignore an invalid or unavailable browser storage entry. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setProductsLoading(true);
      void browseProducts(undefined, search.trim() || undefined)
        .then((result) => { if (active) setProducts(result.items ?? []); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Products could not be loaded."); })
        .finally(() => { if (active) setProductsLoading(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [productsRevision, search]);

  useEffect(() => {
    let active = true;
    if (!session || !registerId || cart.length === 0) return () => { active = false; };
    const fingerprint = JSON.stringify([registerId, cart.map(({ product, quantity }) => [product.id, quantity, product.price])]);
    const timer = window.setTimeout(() => {
      void quoteSale({
        registerId,
        items: cart.map(({ product, quantity }) => ({
          productId: product.id,
          name: product.name,
          quantity,
          unitPrice: product.price,
          lineTotal: Math.round(product.price * quantity * 100) / 100,
        })),
      }).then((value) => { if (active) { setQuote(value); setQuotedFingerprint(fingerprint); } })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Price quote failed."); });
    }, 120);
    return () => { active = false; window.clearTimeout(timer); };
  }, [cart, registerId, session]);

  const selectedRegister = registers.find((item) => item.id === registerId) ?? null;
  const quantity = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart]);
  const currentQuoteFingerprint = session && registerId
    ? JSON.stringify([registerId, cart.map(({ product, quantity: count }) => [product.id, count, product.price])])
    : null;
  const currentQuote = currentQuoteFingerprint && quotedFingerprint === currentQuoteFingerprint ? quote : null;

  async function startSession() {
    if (!registerId) return;
    const amount = Number(openingFloat);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Opening float must be zero or greater.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      openAttemptKey.current ??= crypto.randomUUID();
      setOpenAttemptPending(true);
      setSession(await openRetailRegisterSession(registerId, amount, openAttemptKey.current));
      openAttemptKey.current = null;
      setOpenAttemptPending(false);
    } catch (cause) {
      try {
        const current = await getRetailRegisterSession(registerId);
        if (current) {
          setSession(current);
          openAttemptKey.current = null;
          setOpenAttemptPending(false);
          return;
        }
      } catch { /* Keep the original open-session error for retry. */ }
      setError(cause instanceof Error ? cause.message : "Could not open this register.");
    } finally {
      setBusy(false);
    }
  }

  function addProduct(product: ProductBrowseItem) {
    if (checkoutRecovery) return;
    setReceipt(null);
    setError(null);
    setCart((current) => {
      const found = current.find((line) => line.product.id === product.id);
      return found
        ? current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { product, quantity: 1 }];
    });
  }

  function changeQuantity(productId: string, delta: number) {
    if (checkoutRecovery) return;
    setCart((current) => current.flatMap((line) => {
      if (line.product.id !== productId) return [line];
      const next = line.quantity + delta;
      return next > 0 ? [{ ...line, quantity: next }] : [];
    }));
  }

  async function takeCash() {
    let attempt = checkoutAttempt.current;
    if (!attempt && currentQuote && cashTendered.trim()
        && (!Number.isFinite(Number(cashTendered)) || Number(cashTendered) <= 0)) {
      setError("Enter a valid cash amount greater than $0.00.");
      return;
    }
    if (!attempt && currentQuote && cashTendered.trim()
        && Number(cashTendered) + 0.000001 < Math.round(currentQuote.total * 20) / 20) {
      setError(`Cash received must cover the rounded total of ${money(Math.round(currentQuote.total * 20) / 20)}.`);
      return;
    }
    if (!attempt) {
      if (!currentQuote || !registerId || !session) return;
      attempt = {
        key: crypto.randomUUID(),
        lines: cart,
        payload: {
          registerId,
          tender: "Cash",
          tendered: cashTendered.trim() ? Number(cashTendered) : currentQuote.total,
          expectedTotal: currentQuote.total,
          expectedGst: currentQuote.gst,
          items: currentQuote.lines.map((line) => ({
            productId: line.productId,
            name: line.name,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.total,
            expectedTaxRate: line.taxRate,
          })),
        },
      };
      checkoutAttempt.current = attempt;
    }
    setBusy(true);
    setError(null);
    try {
      setCheckoutRecovery(true);
      try { sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(attempt)); } catch { /* Checkout idempotency still protects the live request. */ }
      const result = await checkoutSale({ ...attempt.payload, idempotencyKey: attempt.key });
      if (!result.completed) throw new Error("This sale has an unpaid balance. Split payments are not available in this screen yet.");
      setReceipt({
        reference: result.invoiceId || String(result.saleId ?? "Sale"),
        total: result.amountDue,
        gst: result.gst ?? attempt.payload.expectedGst ?? 0,
        change: result.change,
        lines: attempt.lines,
      });
      setCart([]);
      setCashTendered("");
      checkoutAttempt.current = null;
      setCheckoutRecovery(false);
      try { sessionStorage.removeItem(PENDING_CHECKOUT_KEY); } catch { /* Receipt remains visible for this session. */ }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status < 500) {
        checkoutAttempt.current = null;
        setCheckoutRecovery(false);
        try { sessionStorage.removeItem(PENDING_CHECKOUT_KEY); } catch { /* Keep the operator in control. */ }
      }
      const message = cause instanceof ApiError && cause.status === 409
        ? `${cause.message} Review the cart and refresh the quote.`
        : cause instanceof Error ? cause.message : "Cash checkout failed.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[1500px] flex-col gap-4 p-4 text-[var(--oh-text)] lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--oh-border)] pb-4">
        <div>
          <h1 className="text-xl font-semibold">Sell</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">Orithos register {selectedRegister ? `· ${selectedRegister.name}` : "· no register configured"}</p>
        </div>
        <div className="flex items-center gap-2">
          <select aria-label="Register" value={registerId ?? ""} disabled={checkoutRecovery || openAttemptPending} onChange={(event) => {
            const id = Number(event.target.value);
            setRegisterId(id);
            setCart([]);
            setSession(null);
            const selected = registers.find((item) => item.id === id);
            if (selected) void getRetailRegisterSession(id).then(setSession).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not read register session."));
          }} className="h-10 min-w-40 rounded border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-sm">
            {registers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button type="button" onClick={() => { setLoading(true); setError(null); void load(); setProductsRevision((revision) => revision + 1); }} title="Refresh register and products" aria-label="Refresh register and products" className="grid size-10 place-items-center rounded border border-[var(--oh-border)]"><RefreshCw size={17} /></button>
        </div>
      </header>

      {checkoutRecovery && <div role="status" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">A previous payment response is pending. Retry the same payment to confirm its result; the cart is locked to prevent a duplicate sale.</div>}
      {error && <div role="alert" className="flex items-start gap-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"><AlertCircle size={18} className="mt-0.5 shrink-0" />{error}</div>}

      {receipt && <section aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">
        <div><strong>Sale complete · {receipt.reference}</strong><span className="ml-3">{money(receipt.total)} incl. GST {money(receipt.gst)}</span>{receipt.change > 0 && <span className="ml-3">Change {money(receipt.change)}</span>}</div>
        <button type="button" onClick={() => setReceipt(null)} title="Dismiss receipt" aria-label="Dismiss receipt" className="grid size-8 place-items-center rounded border border-green-300"><X size={16} /></button>
      </section>}

      {!session ? <section className="flex flex-wrap items-end gap-3 rounded border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4">
        <div className="mr-auto"><h2 className="font-semibold">Register closed</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Open an Orithos session before quoting or taking payment.</p></div>
        <label className="grid gap-1 text-sm">Opening float (AUD)<input inputMode="decimal" value={openingFloat} disabled={openAttemptPending} onChange={(event) => setOpeningFloat(event.target.value)} className="h-10 w-36 rounded border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 disabled:opacity-60" /></label>
        <button type="button" onClick={() => void startSession()} disabled={!registerId || busy || loading} className="h-10 rounded bg-[var(--oh-orange)] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Opening…" : openAttemptPending ? "Retry opening" : "Open register"}</button>
      </section> : <div className="flex items-center gap-2 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900"><span className="size-2 rounded-full bg-green-600" />Session open · float {money(Number(session.openingFloat))}</div>}

      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Products</h2>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" aria-label="Search products" className="h-10 w-full max-w-sm rounded border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-sm" />
          </div>
          {loading || productsLoading ? <div className="grid min-h-48 place-items-center text-[var(--oh-muted)]"><LoaderCircle className="animate-spin" /></div>
            : products.length === 0 ? <div className="grid min-h-48 place-items-center rounded border border-dashed border-[var(--oh-border)] text-sm text-[var(--oh-muted)]">No products found.</div>
              : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">{products.map((product) => <button key={product.id} type="button" onClick={() => addProduct(product)} disabled={!session || busy || checkoutRecovery} className="flex min-h-28 flex-col items-start justify-between rounded border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3 text-left transition hover:border-[var(--oh-orange)] disabled:opacity-50"><span className="line-clamp-2 text-sm font-medium">{product.name}</span><span className="mt-3 flex w-full items-center justify-between text-sm"><span>{money(product.price)}</span><Plus size={17} /></span></button>)}</div>}
        </section>

        <aside className="flex min-h-[360px] flex-col rounded border border-[var(--oh-border)] bg-[var(--oh-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--oh-border)] px-4 py-3"><h2 className="font-semibold">Current sale</h2><span className="text-sm text-[var(--oh-muted)]">{quantity} items</span></div>
          <div className="flex-1 divide-y divide-[var(--oh-border)] overflow-auto">
            {cart.length === 0 ? <div className="grid min-h-40 place-items-center text-sm text-[var(--oh-muted)]"><span className="flex items-center gap-2"><ShoppingBasket size={18} />Cart is empty</span></div>
              : cart.map(({ product, quantity: count }) => <div key={product.id} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{product.name}</p><p className="mt-1 text-xs text-[var(--oh-muted)]">{money(product.price)} each</p></div><div className="flex items-center gap-2"><button type="button" aria-label={`Remove one ${product.name}`} onClick={() => changeQuantity(product.id, -1)} disabled={checkoutRecovery} className="grid size-8 place-items-center rounded border border-[var(--oh-border)] disabled:opacity-50">−</button><span className="w-5 text-center text-sm">{count}</span><button type="button" aria-label={`Add one ${product.name}`} onClick={() => changeQuantity(product.id, 1)} disabled={checkoutRecovery} className="grid size-8 place-items-center rounded border border-[var(--oh-border)] disabled:opacity-50">+</button></div><strong className="w-20 text-right text-sm">{money(product.price * count)}</strong></div>)}
          </div>
          <div className="border-t border-[var(--oh-border)] p-4">
            <div className="mb-2 flex justify-between text-sm text-[var(--oh-muted)]"><span>Subtotal ex GST</span><span>{money(currentQuote?.subtotalExGst ?? 0)}</span></div>
            <div className="mb-3 flex justify-between text-sm text-[var(--oh-muted)]"><span>GST</span><span>{money(currentQuote?.gst ?? 0)}</span></div>
            <div className="mb-4 flex justify-between text-lg font-semibold"><span>Total</span><span>{money(currentQuote?.total ?? 0)}</span></div>
            <label className="mb-3 grid gap-1 text-sm text-[var(--oh-muted)]">Cash received (AUD)<input inputMode="decimal" value={cashTendered} disabled={checkoutRecovery} onChange={(event) => setCashTendered(event.target.value)} placeholder={currentQuote ? money(currentQuote.total) : ""} className="h-10 rounded border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[var(--oh-text)]" /></label>
            <button type="button" onClick={() => void takeCash()} disabled={(!checkoutRecovery && (!session || !currentQuote)) || !cart.length || busy} className="h-12 w-full rounded bg-green-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Processing…" : checkoutRecovery ? "Retry same payment" : currentQuote ? `Take cash · ${money(currentQuote.total)}` : "Waiting for server quote"}</button>
            <p className="mt-2 text-center text-xs text-[var(--oh-muted)]">Cash is recorded in Orithos. EFTPOS is not enabled in this register screen.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}

export const OrithosRegisterPage = NativeOrithosRegisterPage;
