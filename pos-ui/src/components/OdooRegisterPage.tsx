"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Archive, Check, CircleAlert, Clock3, Keyboard, LoaderCircle, Minus, Plus, Printer, RefreshCw, RotateCcw, Search, SquareParking, Trash2, X } from "lucide-react";
import {
  getOdooPosBootstrap,
  getOdooSession,
  quoteOdooPosOrder,
  searchOdooRecords,
  submitOdooPosOrder,
  type OdooCustomerRecord,
  type OdooCheckoutQuote,
  type OdooPosBootstrap,
  type OdooPosCategoryRecord,
  type OdooProductRecord,
} from "@/lib/odoo-api";
import { PlusIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { splitMoney } from "@/lib/sell-screen";

type CartLine = { product: OdooProductRecord; quantity: number; /** Units per pack (1 = bottle/each, 12 = case). */ packFactor: number };
const CASE_PACK_OPTIONS = [1, 6, 12, 24] as const;
type ParkedOdooSale = {
  id: string;
  ownerUserId: string;
  companyId: number;
  companyName: string;
  registerName: string;
  sessionName: string;
  paymentMethodId: number | null;
  customer: { id: number; name: string } | null;
  lines: CartLine[];
  createdAt: string;
};
type CompletedReceipt = {
  reference: string;
  total: number;
  subtotal: number;
  gst: number;
  tendered: number;
  change: number;
  lines: { name: string; quantity: number; subtotal: number; total: number }[];
  customerName: string;
  companyName: string;
  paymentMethod: string;
  session: string;
  date: string;
};

const PARKED_SALES_KEY = "orithos-odoo-parked-sales-v1";

function isParkedOdooSale(value: unknown): value is ParkedOdooSale {
  if (!value || typeof value !== "object") return false;
  const sale = value as Partial<ParkedOdooSale>;
  return typeof sale.id === "string"
    && typeof sale.ownerUserId === "string"
    && Number.isSafeInteger(sale.companyId)
    && typeof sale.companyName === "string"
    && typeof sale.registerName === "string"
    && typeof sale.sessionName === "string"
    && (sale.paymentMethodId === null || Number.isSafeInteger(sale.paymentMethodId))
    && (sale.customer === null || (typeof sale.customer === "object" && Number.isSafeInteger(sale.customer?.id) && typeof sale.customer?.name === "string"))
    && typeof sale.createdAt === "string"
    && Array.isArray(sale.lines)
    && sale.lines.length > 0
    && sale.lines.every((line) => line && Number.isSafeInteger(line.product?.id) && typeof line.product?.name === "string" && Number.isFinite(line.product?.list_price) && Number.isFinite(line.quantity) && line.quantity > 0 && (line.packFactor === undefined || (Number.isFinite(line.packFactor) && (line.packFactor as number) > 0)));
}

function readParkedOdooSales(): ParkedOdooSale[] {
  const parsed: unknown = JSON.parse(localStorage.getItem(PARKED_SALES_KEY) ?? "[]");
  return Array.isArray(parsed) ? parsed.filter(isParkedOdooSale) : [];
}

const money = (amount: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);

export function OdooRegisterPage() {
  const [bootstrap, setBootstrap] = useState<OdooPosBootstrap | null>(null);
  const [configId, setConfigId] = useState<number | null>(null);
  const [odooUserId, setOdooUserId] = useState<string | null>(null);
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [posCategories, setPosCategories] = useState<OdooPosCategoryRecord[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [products, setProducts] = useState<OdooProductRecord[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [customers, setCustomers] = useState<OdooCustomerRecord[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customer, setCustomer] = useState<OdooCustomerRecord | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [quote, setQuote] = useState<OdooCheckoutQuote | null>(null);
  const [quotedFingerprint, setQuotedFingerprint] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CompletedReceipt | null>(null);
  const [cashTendered, setCashTendered] = useState("");
  const [parkedSales, setParkedSales] = useState<ParkedOdooSale[]>([]);
  const [parkedLoaded, setParkedLoaded] = useState(false);
  const [saleView, setSaleView] = useState<"sell" | "parked">("sell");
  const [parkedAction, setParkedAction] = useState<{ type: "resume" | "discard"; saleId: string } | null>(null);
  const orderUuid = useRef<string | null>(null);
  const checkoutFingerprint = useRef<string | null>(null);
  const quoteRevision = useRef(0);
  const searchRevision = useRef(0);
  const barcodeLookupBusy = useRef(false);

  const loadPos = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const user = await getOdooSession();
      setConnected(Boolean(user));
      setOdooUserId(user?.id ?? null);
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
    setParkedLoaded(false);
    if (!connected || !odooUserId) {
      setParkedSales([]);
      setParkedLoaded(true);
      return;
    }
    try {
      setParkedSales(readParkedOdooSales().filter((sale) => sale.ownerUserId === odooUserId));
      setParkedLoaded(true);
    } catch {
      setParkedSales([]);
      setError("Parked sales could not be read from this terminal. Check browser storage settings.");
      setParkedLoaded(true);
    }
  }, [connected, odooUserId]);

  useEffect(() => {
    const revision = ++searchRevision.current;
    const timer = window.setTimeout(async () => {
      if (!connected) return;
      setProductsLoading(true);
      try {
        const result = await searchOdooRecords<OdooProductRecord>("products", { query, limit: 50, categoryId: categoryId ?? undefined });
        if (revision === searchRevision.current) setProducts(result.items);
      } catch (cause) {
        if (revision === searchRevision.current) setError(cause instanceof Error ? cause.message : "Product search failed.");
      } finally {
        if (revision === searchRevision.current) setProductsLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, categoryId, connected]);

  useEffect(() => {
    if (!connected) {
      setPosCategories([]);
      setCategoriesError(null);
      return;
    }
    let cancelled = false;
    setCategoriesError(null);
    void searchOdooRecords<OdooPosCategoryRecord>("posCategories", { limit: 100 })
      .then((result) => { if (!cancelled) { setPosCategories(result.items); setCategoriesError(null); } })
      .catch((cause) => { if (!cancelled) setCategoriesError(cause instanceof Error ? cause.message : "Product categories could not be loaded."); });
    return () => { cancelled = true; };
  }, [connected]);

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
  const currentQuoteFingerprint = JSON.stringify({
    configId,
    paymentMethodId,
    customerId: customer?.id ?? null,
    lines: lines.map((line) => [line.product.id, line.quantity, line.packFactor || 1]),
  });
  const paymentMethods = selectedConfig?.paymentMethods ?? [];
  const selectedCompanyId = Array.isArray(selectedConfig?.company) ? selectedConfig.company[0] : null;
  const visibleParkedSales = parkedSales.filter((sale) => sale.ownerUserId === odooUserId && sale.companyId === selectedCompanyId);
  const parkedActionSale = parkedAction ? parkedSales.find((sale) => sale.id === parkedAction.saleId) : null;
  const quoteIsCurrent = Boolean(quote && quotedFingerprint === currentQuoteFingerprint);
  const fallbackSubtotal = useMemo(() => Math.round(lines.reduce((sum, line) => sum + line.product.list_price * line.quantity * (line.packFactor || 1), 0) * 100) / 100, [lines]);
  const subtotal = quoteIsCurrent ? quote!.subtotal : fallbackSubtotal;
  const taxTotal = quoteIsCurrent ? quote!.tax : 0;
  const total = quoteIsCurrent ? quote!.unroundedTotal : fallbackSubtotal;
  const selectedPayment = paymentMethods.find((method) => method.id === paymentMethodId);
  const isCashPayment = selectedPayment?.type === "cash";
  const amountToCollect = quoteIsCurrent ? quote!.total : 0;
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const tenderedAmount = isCashPayment && cashTendered.trim() ? Number(cashTendered) : amountToCollect;
  const changeDue = isCashPayment && Number.isFinite(tenderedAmount) ? Math.max(0, Math.round((tenderedAmount - amountToCollect) * 100) / 100) : 0;

  useEffect(() => {
    const revision = ++quoteRevision.current;
    if (!lines.length) {
      setQuote(null);
      setQuotedFingerprint(null);
      setQuoteLoading(false);
      return;
    }
    if (!connected || !selectedConfig?.session || !paymentMethodId) {
      setQuote(null);
      setQuotedFingerprint(null);
      setQuoteLoading(false);
      return;
    }
    setQuote(null);
    setQuotedFingerprint(null);
    setQuoteLoading(true);
    const timer = window.setTimeout(() => {
      void quoteOdooPosOrder({
        configId: selectedConfig.id,
        paymentMethodId,
        customerId: customer?.id ?? null,
        lines: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity, uomFactor: line.packFactor || 1 })),
      }).then((result) => {
        if (revision === quoteRevision.current) {
          setQuote(result);
          setQuotedFingerprint(currentQuoteFingerprint);
          setQuoteLoading(false);
          setError(null);
        }
      }).catch((cause) => {
        if (revision === quoteRevision.current) {
          setQuote(null);
          setQuoteLoading(false);
          setError(cause instanceof Error ? cause.message : "Odoo could not calculate tax for this cart.");
        }
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [connected, currentQuoteFingerprint, customer, lines, paymentMethodId, selectedConfig]);

  function formatReceiptDate(value: string) {
    const date = new Date(`${value.replace(" ", "T")}Z`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function addProduct(product: OdooProductRecord, packFactor = 1) {
    setLines((current) => {
      const found = current.find((line) => line.product.id === product.id && (line.packFactor || 1) === packFactor);
      return found
        ? current.map((line) => line.product.id === product.id && (line.packFactor || 1) === packFactor ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { product, quantity: 1, packFactor }];
    });
  }

  function setLinePackFactor(productId: number, currentFactor: number, nextFactor: number) {
    setLines((current) => current.map((line) =>
      line.product.id === productId && (line.packFactor || 1) === currentFactor
        ? { ...line, packFactor: nextFactor }
        : line));
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

  function changeQuantity(productId: number, packFactor: number, amount: number) {
    setLines((current) => current
      .map((line) => line.product.id === productId && (line.packFactor || 1) === packFactor ? { ...line, quantity: line.quantity + amount } : line)
      .filter((line) => line.quantity > 0));
  }

  function saveParkedSales(next: ParkedOdooSale[]) {
    if (!odooUserId) {
      setError("Connect an Odoo staff account before saving a parked sale.");
      return false;
    }
    try {
      const otherUsersSales = readParkedOdooSales().filter((sale) => sale.ownerUserId !== odooUserId);
      localStorage.setItem(PARKED_SALES_KEY, JSON.stringify([...otherUsersSales, ...next]));
      setParkedSales(next);
      setError(null);
      return true;
    } catch {
      setError("This terminal could not save the parked sale. Check browser storage settings and try again.");
      return false;
    }
  }

  function parkCurrentSale() {
    if (!lines.length || !selectedConfig || selectedCompanyId === null || !odooUserId) return;
    if (parkedSales.length >= 50) {
      setError("This terminal has reached its 50 parked sale limit. Resume or discard an older sale first.");
      return;
    }
    const sale: ParkedOdooSale = {
      id: crypto.randomUUID(),
      ownerUserId: odooUserId,
      companyId: selectedCompanyId,
      companyName: Array.isArray(selectedConfig.company) ? selectedConfig.company[1] : "Company",
      registerName: selectedConfig.name,
      sessionName: selectedConfig.session?.name ?? "No open session",
      paymentMethodId,
      customer: customer ? { id: customer.id, name: customer.name } : null,
      lines: lines.map((line) => ({ ...line, product: { ...line.product } })),
      createdAt: new Date().toISOString(),
    };
    if (!saveParkedSales([sale, ...parkedSales])) return;
    setLines([]);
    setCustomer(null);
    setCustomerQuery("");
    setCashTendered("");
    setSaleView("parked");
    orderUuid.current = null;
    checkoutFingerprint.current = null;
  }

  function restoreParkedSale(sale: ParkedOdooSale) {
    if (!saveParkedSales(parkedSales.filter((item) => item.id !== sale.id))) return;
    setLines(sale.lines.map((line) => ({ ...line, packFactor: line.packFactor || 1 })));
    setCustomer(sale.customer ? {
      id: sale.customer.id,
      name: sale.customer.name,
      phone: false,
      email: false,
      customer_rank: 0,
      ref: false,
    } : null);
    setCustomerQuery("");
    setCashTendered("");
    if (sale.paymentMethodId && paymentMethods.some((method) => method.id === sale.paymentMethodId)) {
      setPaymentMethodId(sale.paymentMethodId);
    }
    setSaleView("sell");
    orderUuid.current = null;
    checkoutFingerprint.current = null;
  }

  function confirmParkedAction() {
    if (!parkedAction) return;
    const sale = parkedSales.find((item) => item.id === parkedAction.saleId);
    const action = parkedAction;
    setParkedAction(null);
    if (!sale) return;
    if (action.type === "discard") {
      saveParkedSales(parkedSales.filter((item) => item.id !== sale.id));
      return;
    }
    restoreParkedSale(sale);
  }

  function requestResumeParkedSale(sale: ParkedOdooSale) {
    if (lines.length) setParkedAction({ type: "resume", saleId: sale.id });
    else restoreParkedSale(sale);
  }

  function formatParkedDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  async function checkout() {
    if (!selectedConfig?.session || !paymentMethodId || !lines.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const fingerprint = JSON.stringify({
        configId: selectedConfig.id,
        paymentMethodId,
        tendered: tenderedAmount,
        customerId: customer?.id ?? null,
        lines: lines.map((line) => [line.product.id, line.quantity, line.packFactor || 1]),
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
        tendered: tenderedAmount,
        lines: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity, uomFactor: line.packFactor || 1 })),
      });
      setReceipt({
        reference: result.receipt,
        total: result.total,
        subtotal: result.subtotal,
        gst: result.gst,
        tendered: result.tendered,
        change: result.change,
        lines: result.lines,
        customerName: customer?.name ?? "Walk-in customer",
        companyName: Array.isArray(selectedConfig.company) ? selectedConfig.company[1] : "Orithos POS",
        paymentMethod: selectedPayment?.name ?? "Payment",
        session: selectedConfig.session.name,
        date: result.date,
      });
      setLines([]);
      setCustomer(null);
      setCustomerQuery("");
      setCashTendered("");
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

  const { whole: totalWhole, cents: totalCents } = splitMoney(amountToCollect);
  const canFinalise = Boolean(lines.length && quoteIsCurrent && !quoteLoading && selectedConfig?.session && paymentMethodId && !busy && Number.isFinite(tenderedAmount) && tenderedAmount + 0.001 >= amountToCollect);
  const summaryMuted = "text-[var(--sf-summary)]";

  return (
    <main className="flex h-[calc(100dvh-50px)] min-h-0 flex-col overflow-hidden bg-white p-2 font-sans">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <select aria-label="Register" value={configId ?? ""} onChange={(event) => {
            const id = Number(event.target.value);
            setConfigId(id);
            setCashTendered("");
            const config = bootstrap?.configs.find((item) => item.id === id);
            setPaymentMethodId(config?.paymentMethods[0]?.id ?? null);
          }} className="h-9 max-w-[220px] border border-black/20 bg-white px-2 text-sm text-black">
            {bootstrap?.configs.map((config) => <option key={config.id} value={config.id}>{config.name}{config.session ? "" : " · Closed"}</option>)}
          </select>
          <button type="button" onClick={() => void loadPos()} disabled={refreshing} title="Refresh register data" className="grid h-9 w-9 place-items-center border border-black/20 bg-white text-black hover:bg-[var(--sf-pad-bg)] disabled:opacity-60">
            {refreshing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
          {lines.length > 0 && <button type="button" onClick={parkCurrentSale} disabled={!parkedLoaded || !selectedConfig || busy} className="inline-flex h-9 items-center gap-1.5 border border-black/20 bg-white px-2.5 text-sm font-medium text-black hover:bg-[var(--sf-pad-bg)] disabled:opacity-50"><Archive size={15} /> Park</button>}
        </div>
        <p className="truncate text-xs text-[var(--oh-muted)]">{selectedConfig?.name ?? "Register"}{selectedConfig?.session ? ` · ${selectedConfig.session.name}` : " · Closed"}</p>
      </div>

      {!selectedConfig?.session && (
        <div role="status" className="mb-2 flex flex-wrap items-center justify-between gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <span>No open session — open one in Odoo, then refresh.</span>
          <a href="https://odoo.orithos.com.au/odoo/point-of-sale" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 shrink-0 items-center justify-center bg-[var(--sf-cta)] px-3 font-semibold text-white hover:bg-[var(--sf-cta-hover)]">Open Odoo POS</a>
        </div>
      )}
      {error && <div role="alert" className="mb-2 flex items-start justify-between gap-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="font-bold">×</button></div>}

      <div className="flex min-h-0 flex-1 gap-2">
        {/* Sell pad — Shopfront geometry */}
        <section className="flex min-w-0 flex-1 flex-col border-[0.667px] border-black">
          {saleView === "sell" ? (
            <>
              <div role="group" aria-label="Search and filter POS products" className="flex h-[50px] shrink-0 items-center border-b border-[#bdbdbd] bg-white px-4">
                <Search size={18} className="mr-2 shrink-0 text-[var(--sf-placeholder)]" />
                <input
                  aria-label="Search products by name, barcode or code"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => void handleProductSearchKeyDown(event)}
                  placeholder="Search for products…"
                  className="h-full min-w-0 flex-1 bg-transparent text-base text-black outline-none placeholder:text-[var(--sf-placeholder)]"
                />
                {productsLoading && <LoaderCircle size={16} className="ml-2 animate-spin text-[var(--sf-placeholder)]" />}
                <select aria-label="POS category" value={categoryId ?? ""} onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : null)} className="ml-2 hidden h-9 max-w-[160px] border border-[#bdbdbd] bg-white px-2 text-xs font-medium text-black sm:block">
                  <option value="">All categories</option>
                  {posCategories.map((category) => <option key={category.id} value={category.id}>{Array.isArray(category.parent_id) ? `${category.parent_id[1]} / ${category.name}` : category.name}</option>)}
                </select>
              </div>
              {categoriesError && <p role="status" className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">{categoriesError}</p>}
              <div className="relative min-h-0 flex-1 overflow-y-auto bg-[var(--sf-pad-bg)] p-1.5">
                {products.length ? (
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {products.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        title={product.display_name || product.name}
                        onClick={() => addProduct(product)}
                        disabled={!selectedConfig?.session || product.qty_available <= 0}
                        className="flex min-h-[72px] flex-col justify-center border border-white bg-[rgb(206,229,252)] px-2 py-2 text-left transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:brightness-50"
                      >
                        <span className="line-clamp-2 text-[13px] font-medium leading-4 text-black">{product.display_name || product.name}</span>
                        <span className="mt-1 text-sm font-semibold tabular-nums text-black">{money(product.list_price)}</span>
                        <span className={cn("mt-0.5 text-[11px]", product.qty_available > 0 ? "text-black/60" : "font-medium text-amber-800")}>
                          {product.qty_available > 0 ? `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(product.qty_available)} avail.` : "No stock"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid h-full place-items-center px-5 text-center text-sm text-black/50">
                    {productsLoading ? "Loading products…" : (
                      <div>
                        <p>No POS products match this search and category.</p>
                        {(query || categoryId !== null) && (
                          <button type="button" onClick={() => { setQuery(""); setCategoryId(null); }} className="mt-2 font-semibold text-[var(--sf-tab-blue)] underline underline-offset-2">Clear filters</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--sf-pad-bg)] p-3">
              <p className="mb-3 flex items-start gap-2 bg-white/80 p-3 text-xs leading-5 text-black/60"><Clock3 size={15} className="mt-0.5 shrink-0" />Parked sales are saved on this terminal.</p>
              {visibleParkedSales.length ? (
                <div className="grid gap-2">
                  {visibleParkedSales.map((sale) => (
                    <article key={sale.id} className="border border-black/15 bg-white p-3">
                      <h3 className="truncate text-sm font-semibold text-black">{sale.customer?.name ?? "Walk-in customer"}</h3>
                      <p className="mt-1 text-xs text-black/55">{formatParkedDate(sale.createdAt)} · {sale.registerName}</p>
                      <p className="mt-1 text-xs text-black/55">{sale.lines.reduce((sum, line) => sum + line.quantity, 0)} items · {money(sale.lines.reduce((sum, line) => sum + line.product.list_price * line.quantity * (line.packFactor || 1), 0))}</p>
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => requestResumeParkedSale(sale)} className="inline-flex h-9 flex-1 items-center justify-center gap-2 bg-[var(--sf-cta)] px-3 text-sm font-semibold text-white hover:bg-[var(--sf-cta-hover)]"><RotateCcw size={15} /> Resume</button>
                        <button type="button" onClick={() => setParkedAction({ type: "discard", saleId: sale.id })} className="h-9 border border-black/20 px-3 text-sm font-medium text-black/60 hover:text-red-700">Discard</button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="grid h-[60%] place-items-center text-center">
                  <div>
                    <Archive size={24} className="mx-auto text-black/40" />
                    <p className="mt-2 text-sm font-medium text-black">No parked sales</p>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="hidden shrink-0 lg:block">
            <div className="h-1 w-full bg-[#e0e0e0]">
              <div className="h-full bg-[var(--sf-tab-blue)] transition-all" style={{ width: saleView === "parked" ? "100%" : "40%" }} />
            </div>
            <ul className="flex h-[50px] items-center bg-white">
              <li className="flex-1">
                <button type="button" onClick={() => setSaleView("sell")} className={cn("flex h-[50px] w-full cursor-pointer items-center justify-center gap-2 text-[19.2px]", saleView === "sell" ? "text-[var(--sf-tab-blue)]" : "text-black")}>
                  <Keyboard size={19} strokeWidth={1.5} /> Sales Keys
                </button>
              </li>
              <li className="flex-1">
                <button type="button" onClick={() => setSaleView("parked")} className={cn("flex h-[50px] w-full cursor-pointer items-center justify-center gap-2 text-[19.2px]", saleView === "parked" ? "text-[var(--sf-tab-blue)]" : "text-black")}>
                  <SquareParking size={19} strokeWidth={1.5} /> Parked Sales
                  {visibleParkedSales.length > 0 && <span className="text-sm">({visibleParkedSales.length})</span>}
                </button>
              </li>
            </ul>
          </div>
          <div className="flex h-[50px] shrink-0 border-t border-black/10 bg-white lg:hidden">
            <button type="button" onClick={() => setSaleView("sell")} className={cn("flex-1 text-sm font-semibold", saleView === "sell" ? "text-[var(--sf-tab-blue)]" : "text-black")}>Sales Keys</button>
            <button type="button" onClick={() => setSaleView("parked")} className={cn("flex-1 text-sm font-semibold", saleView === "parked" ? "text-[var(--sf-tab-blue)]" : "text-black")}>Parked</button>
          </div>
        </section>

        {/* Cart sidebar — Shopfront 419px */}
        <section className="flex w-full min-h-0 flex-col border-[0.667px] border-black bg-white lg:w-[419px] lg:shrink-0">
          <div className="flex h-[75px] shrink-0 items-center border-b-[0.667px] border-black">
            {customer ? (
              <>
                <button type="button" onClick={() => setCustomerQuery(customer.name)} className="flex flex-1 cursor-pointer items-center text-left">
                  <span className="ml-4 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[var(--sf-muted)] text-white">{customer.name.charAt(0)}</span>
                  <span className="mx-2 truncate text-[18.72px] font-bold text-black">{customer.name}</span>
                </button>
                <button type="button" aria-label="Remove customer" onClick={() => setCustomer(null)} className="mr-4 flex h-8 w-8 cursor-pointer items-center justify-center text-[var(--sf-muted)] hover:text-black"><X size={20} /></button>
              </>
            ) : (
              <label className="flex h-full flex-1 cursor-text items-center">
                <PlusIcon size={18} strokeWidth={1.5} className="ml-4 mr-2 shrink-0 text-black" />
                <input
                  value={customerQuery}
                  onChange={(event) => setCustomerQuery(event.target.value)}
                  placeholder="Add Customer"
                  className="h-full min-w-0 flex-1 bg-transparent text-[18.72px] font-bold text-black outline-none placeholder:text-black"
                />
              </label>
            )}
          </div>
          {!customer && customers.length > 0 && (
            <div className="max-h-36 shrink-0 overflow-y-auto border-b border-[#eee]">
              {customers.map((item) => (
                <button key={item.id} type="button" onClick={() => { setCustomer(item); setCustomers([]); setCustomerQuery(""); }} className="block w-full border-b border-[#eee] px-4 py-2 text-left text-sm hover:bg-[rgb(206,229,252)]">
                  {item.name}<span className="ml-2 text-xs text-black/50">{item.phone || item.email}</span>
                </button>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
              {lines.length ? lines.map(({ product, quantity: qty, packFactor }) => {
                const factor = packFactor || 1;
                const quotedLine = quoteIsCurrent ? quote?.lines.find((line) => line.productId === product.id && line.uomFactor === factor) : undefined;
                const lineTotal = splitMoney(quotedLine?.total ?? product.list_price * qty * factor);
                return (
                <div key={`${product.id}-${factor}`} className="flex flex-col gap-1.5 border-b border-[#eee] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 shrink-0 text-[16px] text-black">{qty}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] text-black">{product.display_name || product.name}</span>
                        <span className="text-[13px] text-[var(--sf-muted)]">{quotedLine ? `${money(quotedLine.total / qty)} each inc. GST` : `${money(product.list_price)} each`}{factor > 1 ? ` · ${factor}/pack` : ""}</span>
                    </span>
                    <span className="shrink-0 text-[16px] text-black">${lineTotal.whole}.{lineTotal.cents}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label={`Decrease ${product.name}`} onClick={() => changeQuantity(product.id, factor, -1)} className="grid h-8 w-8 place-items-center border border-black/15"><Minus size={14} /></button>
                      <button type="button" aria-label={`Increase ${product.name}`} onClick={() => changeQuantity(product.id, factor, 1)} className="grid h-8 w-8 place-items-center border border-black/15"><Plus size={14} /></button>
                      <button type="button" aria-label={`Remove ${product.name}`} onClick={() => setLines((current) => current.filter((line) => !(line.product.id === product.id && (line.packFactor || 1) === factor)))} className="grid h-8 w-8 place-items-center text-[var(--sf-muted)] hover:text-[rgb(222,84,84)]"><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] font-medium text-black/50">Pack / case
                    <select aria-label={`Pack size for ${product.name}`} value={factor} onChange={(event) => setLinePackFactor(product.id, factor, Number(event.target.value))} className="h-8 border border-black/15 bg-white px-2 text-xs font-semibold text-black">
                      {CASE_PACK_OPTIONS.map((size) => <option key={size} value={size}>{size === 1 ? "Each / bottle" : `Case ×${size}`}</option>)}
                    </select>
                  </label>
                </div>
              );
            }) : null}
          </div>

          <div className="relative shrink-0">
            {(isCashPayment || paymentMethods.length > 1) && (
              <div className="border-t border-[#eee] px-3 py-2">
                <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-black/45">Payment
                  <select value={paymentMethodId ?? ""} onChange={(event) => { setPaymentMethodId(Number(event.target.value) || null); setCashTendered(""); }} disabled={!paymentMethods.length} className="h-9 border border-black/15 bg-white px-2 text-sm font-medium normal-case tracking-normal text-black">
                    {paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
                  </select>
                </label>
                {isCashPayment && (
                  <div className="mt-2">
                    <label htmlFor="cash-tendered" className="flex items-center justify-between text-sm text-black"><span>Cash received</span><span className="text-xs text-black/50">Due {money(amountToCollect)}</span></label>
                    <input id="cash-tendered" type="number" inputMode="decimal" min={amountToCollect} max={1_000_000} step="0.01" value={cashTendered} onChange={(event) => setCashTendered(event.target.value)} placeholder={amountToCollect.toFixed(2)} className="mt-1 h-9 w-full border border-black/15 px-2 text-base tabular-nums outline-none focus:border-[var(--sf-cta)]" />
                    {Number.isFinite(tenderedAmount) && tenderedAmount + 0.001 >= amountToCollect && <p className="mt-1 text-sm tabular-nums text-black/70">Change {money(changeDue)}</p>}
                  </div>
                )}
              </div>
            )}
            <div className="flex h-[112px]">
              <div className={cn("flex flex-1 flex-col justify-center p-2", lines.length ? "text-black" : summaryMuted)}>
                <p className="text-[16px] leading-[19px]">{quantity} {quantity === 1 ? "Product" : "Products"}</p>
                <p className="text-[12px] leading-[16px]">Subtotal {money(subtotal)}</p>
                <p className="text-[12px] leading-[16px]">GST {quoteLoading ? "calculating…" : money(taxTotal)}</p>
                {amountToCollect !== total && <p className="text-[13px] leading-[16px]">Rounding {money(amountToCollect - total)}</p>}
              </div>
              <div className={cn("flex flex-1 flex-col items-center justify-center p-2 text-center", lines.length ? "text-black" : summaryMuted)}>
                <p className="leading-none">
                  <span className="text-[40px]">${totalWhole}</span>
                  <span className="align-top text-[24px]">.{totalCents}</span>
                </p>
                <p className="text-[24px] [font-variant:small-caps]">Total</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void checkout()}
              disabled={!canFinalise}
              className={cn(
                "h-[50px] w-full px-2 py-1 text-center text-[32px] text-[var(--sf-on-dark)] [font-variant:small-caps]",
                canFinalise ? "cursor-pointer bg-[var(--sf-cta)] hover:bg-[var(--sf-cta-hover)]" : "cursor-not-allowed bg-[#bdbdbd]",
              )}
            >
              {busy ? "Processing…" : quoteLoading ? "Calculating…" : !selectedConfig?.session ? "No session" : "Finalise"}
            </button>
          </div>
        </section>
      </div>

      {receipt && <div role="dialog" aria-modal="true" aria-labelledby="sale-complete-title" className="receipt-overlay fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setReceipt(null); }}>
        <section className="receipt-print my-auto w-full max-w-sm rounded-xl border border-[var(--oh-border)] bg-white p-6 shadow-2xl">
          <header className="receipt-print-hidden mb-4 flex items-center justify-between gap-4 border-b border-[var(--oh-border)] pb-3"><div className="flex items-center gap-2 text-emerald-700"><Check size={20} /><h2 id="sale-complete-title" className="text-lg font-semibold text-[var(--oh-text)]">Sale complete</h2></div><button type="button" onClick={() => setReceipt(null)} aria-label="Close receipt" className="grid h-9 w-9 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)]"><X size={18} /></button></header>
          <div className="text-center"><p className="text-sm font-bold uppercase tracking-[.15em] text-[var(--oh-text)]">{receipt.companyName}</p><p className="mt-1 text-xs text-[var(--oh-muted)]">Sales receipt</p><h3 className="mt-3 text-lg font-bold text-[var(--oh-text)]">{receipt.reference}</h3><p className="mt-1 text-xs text-[var(--oh-muted)]">{formatReceiptDate(receipt.date)}</p></div>
          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 border-y border-dashed border-[var(--oh-border)] py-3 text-xs"><dt className="text-[var(--oh-muted)]">Customer</dt><dd className="text-right font-medium text-[var(--oh-text)]">{receipt.customerName}</dd><dt className="text-[var(--oh-muted)]">Register</dt><dd className="text-right text-[var(--oh-text)]">{receipt.session}</dd></dl>
          <table className="mt-4 w-full text-xs"><thead><tr className="border-b border-[var(--oh-border)] text-[var(--oh-muted)]"><th className="pb-2 text-left font-semibold">Item</th><th className="pb-2 text-right font-semibold">Qty</th><th className="pb-2 text-right font-semibold">Total</th></tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{receipt.lines.map((line, index) => <tr key={`${line.name}-${index}`}><td className="py-2 pr-2 font-medium text-[var(--oh-text)]">{line.name}</td><td className="py-2 text-right tabular-nums text-[var(--oh-text-secondary)]">{line.quantity}</td><td className="py-2 text-right tabular-nums text-[var(--oh-text)]">{money(line.total)}</td></tr>)}</tbody></table>
          <dl className="mt-4 grid grid-cols-2 gap-y-1.5 text-xs"><dt className="text-[var(--oh-muted)]">Subtotal</dt><dd className="text-right tabular-nums text-[var(--oh-text)]">{money(receipt.subtotal)}</dd><dt className="text-[var(--oh-muted)]">Tax</dt><dd className="text-right tabular-nums text-[var(--oh-text)]">{money(receipt.gst)}</dd><dt className="border-t border-[var(--oh-border)] pt-2 text-sm font-bold text-[var(--oh-text)]">Total</dt><dd className="border-t border-[var(--oh-border)] pt-2 text-right text-sm font-bold tabular-nums text-[var(--oh-text)]">{money(receipt.total)}</dd></dl>
          <section className="mt-4 border-t border-dashed border-[var(--oh-border)] pt-3"><h4 className="text-xs font-semibold text-[var(--oh-text)]">Payment</h4><dl className="mt-2 grid grid-cols-2 gap-y-1.5 text-xs"><dt className="text-[var(--oh-muted)]">Method</dt><dd className="text-right text-[var(--oh-text)]">{receipt.paymentMethod}</dd>{receipt.change > 0 && <><dt className="text-[var(--oh-muted)]">Cash received</dt><dd className="text-right tabular-nums text-[var(--oh-text)]">{money(receipt.tendered)}</dd><dt className="font-semibold text-[var(--oh-text)]">Change</dt><dd className="text-right font-semibold tabular-nums text-[var(--oh-text)]">{money(receipt.change)}</dd></>}</dl></section>
          <p className="mt-5 text-center text-[10px] text-[var(--oh-muted)]">Thank you for shopping with us.</p>
          <footer className="receipt-print-hidden mt-5 flex gap-2 border-t border-[var(--oh-border)] pt-4"><button type="button" onClick={() => setReceipt(null)} className="h-11 flex-1 rounded-md border border-[var(--oh-border)] text-sm font-semibold text-[var(--oh-text)]">New sale</button><button type="button" onClick={() => window.print()} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]"><Printer size={16} /> Print receipt</button></footer>
        </section>
      </div>}
      {parkedAction && parkedActionSale && <div role="presentation" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setParkedAction(null); }}>
        <section role="alertdialog" aria-modal="true" aria-labelledby="parked-action-title" aria-describedby="parked-action-description" className="w-full max-w-md rounded-xl border border-[var(--oh-border)] bg-white p-6 shadow-2xl">
          <h2 id="parked-action-title" className="text-lg font-semibold text-[var(--oh-text)]">{parkedAction.type === "resume" ? "Replace the current sale?" : "Discard this parked sale?"}</h2>
          <p id="parked-action-description" className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">{parkedAction.type === "resume" ? "Your current cart will be replaced with the parked sale. The parked sale will be removed from this terminal." : "This removes the saved draft from this terminal. It does not cancel or change any completed Odoo sale."}</p>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setParkedAction(null)} className="h-10 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)]">Cancel</button><button type="button" onClick={confirmParkedAction} className={`h-10 rounded-md px-4 text-sm font-semibold text-white ${parkedAction.type === "discard" ? "bg-red-700 hover:bg-red-800" : "bg-[var(--sf-link-blue)] hover:brightness-95"}`}>{parkedAction.type === "resume" ? "Resume sale" : "Discard draft"}</button></div>
        </section>
      </div>}
    </main>
  );
}
