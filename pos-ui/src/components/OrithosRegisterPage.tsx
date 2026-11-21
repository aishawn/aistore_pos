"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, Plus, RefreshCw, RotateCcw, ShoppingBasket, X } from "lucide-react";
import {
  api,
  browseProducts,
  checkoutSale,
  getRetailRegisterSession,
  listRetailRegisters,
  openRetailRegisterSession,
  quoteSale,
  refundSale,
  type CheckoutPayload,
  type CheckoutQuote,
  type Page,
  type ProductBrowseItem,
  type RetailRegister,
  type RetailRegisterSession,
  type SaleForRefund,
  type SaleRefundResponse,
} from "@/lib/api";
import { ApiError } from "@/lib/api";
import { getRetailSalePolicy } from "@/lib/retail-api";
import { useAuth } from "@/lib/auth";
import { readContextOutletId, readRegisterId, WORK_CONTEXT_EVENT, writeRegisterContext, writeWorkActivity } from "@/lib/work-context";
import { clearPendingRegisterOpen, readPendingRegisterOpen, savePendingRegisterOpen } from "@/lib/register-open-attempt";
import { isRegisterSwitchDisabled } from "@/lib/register-switch";

type CartLine = { product: ProductBrowseItem; quantity: number };
type Receipt = { reference: string; total: number; gst: number; change: number; lines: CartLine[] };
type CheckoutAttempt = { key: string; payload: CheckoutPayload; lines: CartLine[] };
type RefundPayload = { registerId: number; reason: string; lines: Array<{ saleItemId: number; quantity: number }> };
type RefundAttempt = { saleId: number; key: string; fingerprint: string; payload: RefundPayload };
const PENDING_CHECKOUT_KEY = "orithos.native-checkout.pending.v1";
const PENDING_REFUND_KEY = "orithos.native-refund.pending.v1";

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
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundSales, setRefundSales] = useState<SaleForRefund[]>([]);
  const [refundSalesLoading, setRefundSalesLoading] = useState(false);
  const [selectedRefundSale, setSelectedRefundSale] = useState<SaleForRefund | null>(null);
  const [refundQuantities, setRefundQuantities] = useState<Record<number, string>>({});
  const [refundReason, setRefundReason] = useState("");
  const [refundReasonRequired, setRefundReasonRequired] = useState<boolean | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundResult, setRefundResult] = useState<SaleRefundResponse | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundRecovery, setRefundRecovery] = useState(false);
  const openAttemptKey = useRef<string | null>(null);
  const checkoutAttempt = useRef<CheckoutAttempt | null>(null);
  const refundAttempt = useRef<RefundAttempt | null>(null);
  const { hasPermission, user, setWorkContext } = useAuth();

  const load = useCallback(async () => {
    try {
      const rows = await listRetailRegisters();
      setRegisters(rows);
      const hasStoredContext = readContextOutletId() === user?.outletId;
      const preferredId = hasStoredContext ? readRegisterId() : (readRegisterId() ?? registerId);
      const selected = preferredId == null && hasStoredContext
        ? null
        : rows.find((item) => item.id === preferredId) ?? rows[0] ?? null;
      setRegisterId(selected?.id ?? null);
      if (selected) setSession(await getRetailRegisterSession(selected.id));
      else setSession(null);
      if (user?.outletId && (selected || !hasStoredContext)) {
        writeRegisterContext(user.outletId, selected?.id ?? null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Orithos could not load the register.");
    } finally {
      setLoading(false);
    }
  }, [registerId, user?.outletId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    let active = true;
    void getRetailSalePolicy()
      .then((policy) => { if (active) setRefundReasonRequired(policy.refundsRequireReason); })
      .catch(() => { if (active) setRefundReasonRequired(null); });
    return () => { active = false; };
  }, []);

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
    if (!user?.id || !user.outletId) return;
    let attempt: ReturnType<typeof readPendingRegisterOpen> = null;
    try {
      attempt = readPendingRegisterOpen(sessionStorage, user.id, user.outletId);
    } catch { return; }
    if (!attempt) return;

    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      openAttemptKey.current = attempt.key;
      setRegisterId(attempt.registerId);
      setOpeningFloat(String(attempt.openingFloat));
      setOpenAttemptPending(true);
      void getRetailRegisterSession(attempt.registerId).then((current) => {
        if (!active || !current) return;
        setSession(current);
        openAttemptKey.current = null;
        setOpenAttemptPending(false);
        try { clearPendingRegisterOpen(sessionStorage); } catch { /* Keep the saved recovery marker if storage is unavailable. */ }
      }).catch((cause) => {
        if (active && !(cause instanceof ApiError && cause.status === 409)) {
          setError(cause instanceof Error ? cause.message : "Could not recover the register open attempt.");
        }
      });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [user?.id, user?.outletId]);

  useEffect(() => {
    try {
      if (cart.length > 0) sessionStorage.setItem("orithos.native-cart-active.v1", "1");
      else sessionStorage.removeItem("orithos.native-cart-active.v1");
    } catch { /* The cart remains usable if session storage is unavailable. */ }
  }, [cart]);

  useEffect(() => {
    if (!user?.id) return;
    const operationPending = checkoutRecovery || refundRecovery || openAttemptPending || busy || refundBusy;
    const activity = operationPending
      ? "operation"
      : cart.length > 0
        ? "cart"
        : refundOpen
          ? "unsaved"
          : null;
    const update = () => writeWorkActivity(activity !== null, user.id, activity ?? "operation");
    update();
    if (!activity) return () => writeWorkActivity(false, user.id);
    const heartbeat = window.setInterval(update, 60_000);
    return () => {
      window.clearInterval(heartbeat);
      writeWorkActivity(false, user.id);
    };
  }, [cart.length, checkoutRecovery, refundRecovery, openAttemptPending, refundOpen, busy, refundBusy, user?.id]);

  useEffect(() => {
    const reloadContext = () => {
      setCart([]);
      setQuote(null);
      setQuotedFingerprint(null);
      setCashTendered("");
      setSession(null);
      setReceipt(null);
      setRefundOpen(false);
      setRefundSales([]);
      setSelectedRefundSale(null);
      setRefundQuantities({});
      setRefundReason("");
      setRefundError(null);
      setRefundResult(null);
      setError(null);
      setProductsRevision((revision) => revision + 1);
      setLoading(true);
      void load();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "orithos_work_outlet_id" || event.key === "orithos_work_register_id") reloadContext();
    };
    window.addEventListener(WORK_CONTEXT_EVENT, reloadContext);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(WORK_CONTEXT_EVENT, reloadContext);
      window.removeEventListener("storage", onStorage);
    };
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const pending = JSON.parse(sessionStorage.getItem(PENDING_REFUND_KEY) ?? "null") as Partial<RefundAttempt> | null;
        if (!pending || typeof pending.saleId !== "number" || typeof pending.key !== "string"
            || typeof pending.fingerprint !== "string" || !pending.payload
            || typeof pending.payload.registerId !== "number" || typeof pending.payload.reason !== "string"
            || !Array.isArray(pending.payload.lines)) return;
        refundAttempt.current = pending as RefundAttempt;
        setRefundRecovery(true);
      } catch { /* Keep invalid or unavailable browser storage from blocking the register. */ }
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
  const refundPreview = useMemo(() => {
    let amount = 0;
    let gst = 0;
    let count = 0;
    for (const line of selectedRefundSale?.items ?? []) {
      const quantity = Number(refundQuantities[line.id] ?? "");
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > line.refundableQuantity || line.quantity <= 0) continue;
      const finalQuantity = quantity === line.refundableQuantity;
      const factor = quantity / line.quantity;
      const lineTotal = Number(line.totalPrice ?? 0);
      const lineTax = Number(line.tax ?? 0);
      amount += finalQuantity ? line.refundableAmount : Math.round(lineTotal * factor * 100) / 100;
      gst += finalQuantity ? line.refundableTax : Math.round(lineTax * factor * 100) / 100;
      count += 1;
    }
    return count ? { amount, gst, cashPaid: Math.round(amount * 20) / 20 } : null;
  }, [refundQuantities, selectedRefundSale]);

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
      if (user?.id && user.outletId) {
        try {
          savePendingRegisterOpen(sessionStorage, {
            key: openAttemptKey.current,
            userId: user.id,
            outletId: user.outletId,
            registerId,
            openingFloat: amount,
          });
        } catch { /* In-memory idempotency remains active when session storage is unavailable. */ }
      }
      setOpenAttemptPending(true);
      setSession(await openRetailRegisterSession(registerId, amount, openAttemptKey.current));
      openAttemptKey.current = null;
      setOpenAttemptPending(false);
      try { clearPendingRegisterOpen(sessionStorage); } catch { /* The open session remains confirmed in memory. */ }
    } catch (cause) {
      try {
        const current = await getRetailRegisterSession(registerId);
        if (current) {
          setSession(current);
          openAttemptKey.current = null;
          setOpenAttemptPending(false);
          try { clearPendingRegisterOpen(sessionStorage); } catch { /* The open session remains confirmed in memory. */ }
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

  async function openRefundWorkspace() {
    if (refundAttempt.current) { await resumePendingRefund(); return; }
    setRefundOpen(true);
    setRefundError(null);
    setSelectedRefundSale(null);
    setRefundQuantities({});
    setRefundSalesLoading(true);
    try {
      const result = await api.get<Page<SaleForRefund>>("/api/sales", { status: "COMPLETED", page: 1, size: 30 });
      setRefundSales(result.items ?? []);
    } catch (cause) {
      setRefundError(cause instanceof Error ? cause.message : "Could not load completed sales.");
    } finally {
      setRefundSalesLoading(false);
    }
  }

  async function selectRefundSale(id: number) {
    setRefundError(null);
    setSelectedRefundSale(null);
    setRefundQuantities({});
    try {
      setSelectedRefundSale(await api.get<SaleForRefund>(`/api/sales/${id}`));
    } catch (cause) {
      setRefundError(cause instanceof Error ? cause.message : "Could not load sale details.");
    }
  }

  async function resumePendingRefund() {
    const attempt = refundAttempt.current;
    if (!attempt) return;
    setRefundOpen(true);
    setRefundError(null);
    try {
      setSelectedRefundSale(await api.get<SaleForRefund>(`/api/sales/${attempt.saleId}`));
      setRefundReason(attempt.payload.reason);
      setRefundQuantities(Object.fromEntries(attempt.payload.lines.map((line) => [line.saleItemId, String(line.quantity)])));
    } catch (cause) {
      setRefundError(cause instanceof Error ? cause.message : "Could not recover the pending refund.");
    }
  }

  async function submitRefund() {
    if (!selectedRefundSale || (!refundRecovery && (!registerId || !session))) return;
    const pending = refundAttempt.current;
    const lines = refundRecovery && pending
      ? pending.payload.lines
      : (selectedRefundSale.items ?? []).flatMap((line) => {
        const quantity = Number(refundQuantities[line.id] ?? "");
        return Number.isFinite(quantity) && quantity > 0 ? [{ saleItemId: line.id, quantity }] : [];
      });
    const reason = refundRecovery && pending ? pending.payload.reason : refundReason.trim();
    if (!lines.length) { setRefundError("Enter a refund quantity for at least one line."); return; }
    if (!refundRecovery && refundReasonRequired === null && !reason) {
      setRefundError("Refund policy is unavailable. Refresh the register before continuing.");
      return;
    }
    if (!reason && refundReasonRequired !== false) { setRefundError("Enter a refund reason."); return; }
    const payload = refundRecovery && pending ? pending.payload : { registerId: registerId!, reason, lines };
    const fingerprint = JSON.stringify([selectedRefundSale.id, payload]);
    const retryingSameRequest = Boolean(refundRecovery && pending && pending.fingerprint === fingerprint);
    if (refundRecovery && !retryingSameRequest) {
      setRefundError("Resolve the pending refund by retrying its original request before starting another refund.");
      return;
    }
    if (!retryingSameRequest && lines.some((line) => line.quantity > ((selectedRefundSale.items ?? []).find((item) => item.id === line.saleItemId)?.refundableQuantity ?? 0))) {
      setRefundError("A quantity exceeds the remaining refundable amount. Refresh the sale and review it.");
      return;
    }
    if (!pending || pending.fingerprint !== fingerprint) {
      refundAttempt.current = { saleId: selectedRefundSale.id, payload, fingerprint, key: crypto.randomUUID() };
    }
    const attempt = refundAttempt.current!;
    setRefundBusy(true);
    setRefundError(null);
    try {
      try { sessionStorage.setItem(PENDING_REFUND_KEY, JSON.stringify(attempt)); }
      catch {
        refundAttempt.current = null;
        setRefundRecovery(false);
        setRefundError("Browser storage is unavailable. The refund was not submitted; enable session storage and retry.");
        return;
      }
      const result = await refundSale(attempt.saleId, attempt.payload, attempt.key);
      setRefundResult(result);
      refundAttempt.current = null;
      setRefundRecovery(false);
      try { sessionStorage.removeItem(PENDING_REFUND_KEY); } catch { /* Keep the confirmed result visible. */ }
      setRefundOpen(false);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status < 500) {
        refundAttempt.current = null;
        setRefundRecovery(false);
        try { sessionStorage.removeItem(PENDING_REFUND_KEY); } catch { /* Preserve the server error. */ }
      } else {
        setRefundRecovery(true);
      }
      setRefundError(cause instanceof Error ? cause.message : "Refund failed.");
    } finally {
      setRefundBusy(false);
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
          {hasPermission("sell.refund") && <button type="button" onClick={() => void openRefundWorkspace()} disabled={!session || busy} title="Refund a completed sale" aria-label="Refund a completed sale" className="inline-flex h-10 items-center gap-2 rounded border border-[var(--oh-border)] px-3 text-sm font-semibold disabled:opacity-50"><RotateCcw size={16} /> Refund</button>}
          <select aria-label="Register" value={registerId ?? ""} disabled={isRegisterSwitchDisabled({
            busy,
            checkoutRecovery,
            openAttemptPending,
            refundBusy,
            refundRecovery,
            refundOpen,
          })} onChange={(event) => {
            const id = Number(event.target.value);
            if (!user?.outletId) return;
            if (cart.length > 0 && !window.confirm("Changing register will clear the current cart. Continue?")) return;
            void setWorkContext({ outletId: user.outletId, registerId: id, globalMode: false }).then(() => {
              writeRegisterContext(user.outletId!, id);
            }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not change register."));
          }} className="h-10 min-w-40 rounded border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-sm">
            <option value="" disabled>Select register</option>
            {registers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button type="button" onClick={() => { setLoading(true); setError(null); void load(); setProductsRevision((revision) => revision + 1); }} title="Refresh register and products" aria-label="Refresh register and products" className="grid size-10 place-items-center rounded border border-[var(--oh-border)]"><RefreshCw size={17} /></button>
        </div>
      </header>

      {checkoutRecovery && <div role="status" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">A previous payment response is pending. Retry the same payment to confirm its result; the cart is locked to prevent a duplicate sale.</div>}
      {error && <div role="alert" className="flex items-start gap-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"><AlertCircle size={18} className="mt-0.5 shrink-0" />{error}</div>}
      {refundRecovery && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950"><span>A refund response is unconfirmed. Retry the exact same request to check its recorded result.</span><button type="button" onClick={() => void resumePendingRefund()} className="min-h-9 rounded border border-amber-500 px-3 font-semibold">Retry same refund</button></div>}

      {refundResult && <section aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"><div><strong>Refund recorded · {refundResult.invoiceId}</strong><span className="ml-3">{money(refundResult.amount)} incl. GST {money(refundResult.gst)} · cash paid {money(refundResult.cashPaid)}</span><span className="ml-3">Original {refundResult.originalSaleId}</span></div><button type="button" onClick={() => setRefundResult(null)} title="Dismiss refund receipt" aria-label="Dismiss refund receipt" className="grid size-8 place-items-center rounded border border-amber-400"><X size={16} /></button></section>}

      {refundOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget && !refundBusy) setRefundOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="native-refund-title" className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded border border-[var(--oh-border)] bg-white shadow-xl">
          <header className="flex items-center justify-between border-b border-[var(--oh-border)] px-4 py-3"><div><h2 id="native-refund-title" className="font-semibold">Refund sale</h2><p className="mt-0.5 text-sm text-[var(--oh-muted)]">Cash refunds link to the original sale and return items to stock.</p></div><button type="button" onClick={() => setRefundOpen(false)} disabled={refundBusy} title="Close refund" aria-label="Close refund" className="grid size-10 place-items-center rounded border border-[var(--oh-border)] disabled:opacity-50"><X size={17} /></button></header>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {refundError && <div role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{refundError}</div>}
            <label className="grid gap-1 text-sm font-medium">Completed sale<select aria-label="Completed sale to refund" disabled={refundSalesLoading || refundBusy || refundRecovery} value={selectedRefundSale?.id ?? ""} onChange={(event) => { const id = Number(event.target.value); if (id) void selectRefundSale(id); else setSelectedRefundSale(null); }} className="h-11 rounded border border-[var(--oh-border)] bg-white px-3"><option value="">Select a sale</option>{refundSales.map((sale) => <option key={sale.id} value={sale.id}>{sale.invoiceId || `Sale ${sale.id}`} · {money(sale.totalPrice)} · {new Date(sale.createdAt).toLocaleString("en-AU")}</option>)}</select></label>
            {refundSalesLoading && <p role="status" className="text-sm text-[var(--oh-muted)]">Loading completed sales…</p>}
            {selectedRefundSale && <>
              <div className="overflow-x-auto rounded border border-[var(--oh-border)]"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-[var(--oh-surface)] text-xs text-[var(--oh-muted)]"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Sold</th><th className="px-3 py-2 text-right">Available</th><th className="px-3 py-2 text-right">Original line</th><th className="px-3 py-2">Refund qty</th></tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{(selectedRefundSale.items ?? []).map((line) => <tr key={line.id}><td className="px-3 py-2">{line.note || `Product ${line.productId ?? ""}`}</td><td className="px-3 py-2 text-right tabular-nums">{line.quantity}</td><td className="px-3 py-2 text-right tabular-nums">{line.refundableQuantity}</td><td className="px-3 py-2 text-right tabular-nums">{money(Number(line.totalPrice ?? 0))}</td><td className="px-3 py-2"><input aria-label={`Refund quantity for ${line.note || line.id}`} type="number" min="0" max={line.refundableQuantity} step="0.0001" disabled={!line.refundableQuantity || refundBusy || refundRecovery} value={refundQuantities[line.id] ?? ""} onChange={(event) => setRefundQuantities((current) => ({ ...current, [line.id]: event.target.value }))} className="h-9 w-28 rounded border border-[var(--oh-border)] px-2 text-right tabular-nums" /></td></tr>)}</tbody></table></div>
              <label className="grid gap-1 text-sm font-medium">Reason{refundReasonRequired === false ? " (optional)" : ""}<input value={refundReason} maxLength={255} required={refundReasonRequired !== false} disabled={refundRecovery} onChange={(event) => setRefundReason(event.target.value)} placeholder="Customer return" className="h-11 rounded border border-[var(--oh-border)] px-3 disabled:bg-[var(--oh-surface)]" /></label>
              {refundPreview && <dl className="grid grid-cols-3 gap-3 border-t border-[var(--oh-border)] pt-3 text-sm"><div><dt className="text-[var(--oh-muted)]">Refund total</dt><dd className="mt-1 font-semibold tabular-nums">{money(refundPreview.amount)}</dd></div><div><dt className="text-[var(--oh-muted)]">GST reversed</dt><dd className="mt-1 font-semibold tabular-nums">{money(refundPreview.gst)}</dd></div><div><dt className="text-[var(--oh-muted)]">Cash paid</dt><dd className="mt-1 font-semibold tabular-nums">{money(refundPreview.cashPaid)}</dd></div></dl>}
            </>}
          </div>
          <footer className="flex flex-wrap justify-end gap-2 border-t border-[var(--oh-border)] p-4"><button type="button" onClick={() => setRefundOpen(false)} disabled={refundBusy} className="h-10 rounded border border-[var(--oh-border)] px-4 text-sm">Cancel</button><button type="button" onClick={() => void submitRefund()} disabled={(!session && !refundRecovery) || !selectedRefundSale || refundBusy || !hasPermission("sell.refund")} className="h-10 rounded bg-amber-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{refundBusy ? "Recording…" : refundRecovery ? "Retry same refund" : "Record cash refund"}</button></footer>
        </section>
      </div>}

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
