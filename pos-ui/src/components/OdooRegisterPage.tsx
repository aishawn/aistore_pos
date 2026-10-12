"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Archive, Check, CircleAlert, Clock3, LoaderCircle, Minus, Plus, Printer, RefreshCw, RotateCcw, Search, Trash2, UserRound, Wine, X } from "lucide-react";
import {
  getOdooPosBootstrap,
  getOdooSession,
  searchOdooRecords,
  submitOdooPosOrder,
  type OdooCustomerRecord,
  type OdooPosBootstrap,
  type OdooPosCategoryRecord,
  type OdooProductRecord,
} from "@/lib/odoo-api";

type CartLine = { product: OdooProductRecord; quantity: number };
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
    && sale.lines.every((line) => line && Number.isSafeInteger(line.product?.id) && typeof line.product?.name === "string" && Number.isFinite(line.product?.list_price) && Number.isFinite(line.quantity) && line.quantity > 0);
}

function readParkedOdooSales(): ParkedOdooSale[] {
  const parsed: unknown = JSON.parse(localStorage.getItem(PARKED_SALES_KEY) ?? "[]");
  return Array.isArray(parsed) ? parsed.filter(isParkedOdooSale) : [];
}

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
  const paymentMethods = selectedConfig?.paymentMethods ?? [];
  const selectedCompanyId = Array.isArray(selectedConfig?.company) ? selectedConfig.company[0] : null;
  const visibleParkedSales = parkedSales.filter((sale) => sale.ownerUserId === odooUserId && sale.companyId === selectedCompanyId);
  const parkedActionSale = parkedAction ? parkedSales.find((sale) => sale.id === parkedAction.saleId) : null;
  const total = useMemo(() => Math.round(lines.reduce((sum, line) => sum + line.product.list_price * line.quantity, 0) * 100) / 100, [lines]);
  const selectedPayment = paymentMethods.find((method) => method.id === paymentMethodId);
  const isCashPayment = selectedPayment?.type === "cash";
  const applyRounding = Boolean(selectedConfig?.cashRounding && (!selectedConfig.onlyRoundCashMethod || selectedPayment?.is_cash_count));
  const amountToCollect = applyRounding && selectedConfig?.cashRounding
    ? roundedTotal(total, selectedConfig.cashRounding.rounding, selectedConfig.cashRounding.rounding_method)
    : total;
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const tenderedAmount = isCashPayment && cashTendered.trim() ? Number(cashTendered) : amountToCollect;
  const changeDue = isCashPayment && Number.isFinite(tenderedAmount) ? Math.max(0, Math.round((tenderedAmount - amountToCollect) * 100) / 100) : 0;

  function formatReceiptDate(value: string) {
    const date = new Date(`${value.replace(" ", "T")}Z`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" }).format(date);
  }

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
    setLines(sale.lines);
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
        tendered: tenderedAmount,
        lines: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
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
            setCashTendered("");
            const config = bootstrap?.configs.find((item) => item.id === id);
            setPaymentMethodId(config?.paymentMethods[0]?.id ?? null);
          }} className="h-10 max-w-[220px] rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]">
            {bootstrap?.configs.map((config) => <option key={config.id} value={config.id}>{config.name}{config.session ? "" : " · Closed"}</option>)}
          </select>
          <button type="button" onClick={() => void loadPos()} disabled={refreshing} title="Refresh register data" className="grid h-10 w-10 place-items-center rounded-md border border-[var(--oh-border)] bg-white text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-60">
            {refreshing ? <LoaderCircle size={17} className="animate-spin" /> : <RefreshCw size={17} />}
          </button>
          {lines.length > 0 && <button type="button" onClick={parkCurrentSale} disabled={!parkedLoaded || !selectedConfig || busy} className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-50"><Archive size={16} /> Park sale</button>}
        </div>
      </header>

      {!selectedConfig?.session && <div role="status" className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">This register has no open session. Open a session in Odoo, then refresh.</div>}
      {error && <div role="alert" className="mb-3 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"><span>{error}</span><button onClick={() => setError(null)} aria-label="Dismiss" className="font-bold">×</button></div>}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
          <div className="flex h-12 shrink-0 items-stretch border-b border-[var(--oh-border)] px-2">
            <button type="button" onClick={() => setSaleView("sell")} className={`border-b-2 px-3 text-sm font-semibold ${saleView === "sell" ? "border-[var(--oh-orange)] text-[var(--oh-text)]" : "border-transparent text-[var(--oh-muted)]"}`}>Sales keys</button>
            <button type="button" onClick={() => setSaleView("parked")} className={`inline-flex items-center gap-2 border-b-2 px-3 text-sm font-semibold ${saleView === "parked" ? "border-[var(--oh-orange)] text-[var(--oh-text)]" : "border-transparent text-[var(--oh-muted)]"}`}>Parked sales <span className="rounded-full bg-[var(--oh-surface)] px-2 py-0.5 text-xs">{visibleParkedSales.length}</span></button>
          </div>
          {saleView === "sell" ? <>
          <div role="group" aria-label="Search and filter POS products" className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--oh-border)] px-3">
            <Search size={18} className="text-[var(--oh-muted)]" />
            <input aria-label="Search products by name, barcode or code" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => void handleProductSearchKeyDown(event)} placeholder="Scan barcode or search products" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--oh-placeholder)]" />
            {productsLoading && <LoaderCircle size={16} className="animate-spin text-[var(--oh-muted)]" />}
            <select aria-label="POS category" value={categoryId ?? ""} onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : null)} className="h-9 max-w-[40%] rounded-md border border-[var(--oh-border)] bg-white px-2 text-xs font-medium text-[var(--oh-text)] sm:max-w-[180px]">
              <option value="">All categories</option>
              {posCategories.map((category) => <option key={category.id} value={category.id}>{Array.isArray(category.parent_id) ? `${category.parent_id[1]} / ${category.name}` : category.name}</option>)}
            </select>
          </div>
          {categoriesError && <p role="status" className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">{categoriesError}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {products.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => <button key={product.id} type="button" title={product.display_name || product.name} onClick={() => addProduct(product)} disabled={!selectedConfig?.session} className="flex min-h-[82px] items-center gap-3 rounded-md border border-[var(--oh-border)] p-3 text-left transition-colors hover:border-[var(--sf-link-blue)] hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-sky-50 text-[var(--sf-tab-blue)]"><Wine size={19} /></span>
                <span className="min-w-0 flex-1"><span className="line-clamp-2 text-[13px] font-medium leading-4 text-[var(--oh-text)]">{product.display_name || product.name}</span><span className="mt-1 block text-sm font-semibold text-[var(--oh-text)]">{money(product.list_price)}</span><span className={`mt-0.5 block text-xs ${product.qty_available > 0 ? "text-[var(--oh-muted)]" : "font-medium text-amber-700"}`}>{product.qty_available > 0 ? `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(product.qty_available)} available` : "No stock on hand"}</span></span>
                <Plus size={17} className="shrink-0 text-[var(--sf-tab-blue)]" />
              </button>)}
            </div> : <div className="grid h-full place-items-center px-5 text-center text-sm text-[var(--oh-muted)]">{productsLoading ? "Loading products…" : <div><p>No POS products match this search and category.</p>{(query || categoryId !== null) && <button type="button" onClick={() => { setQuery(""); setCategoryId(null); }} className="mt-2 font-semibold text-[var(--oh-primary)] underline underline-offset-2">Clear filters to see all products</button>}</div>}</div>}
          </div>
          </> : <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="mb-3 flex items-start gap-2 rounded-md bg-[var(--oh-surface)] p-3 text-xs leading-5 text-[var(--oh-muted)]"><Clock3 size={15} className="mt-0.5 shrink-0" />Parked sales are saved on this terminal. Odoo checks current pricing and availability when you resume and finalise.</p>
            {visibleParkedSales.length ? <div className="grid gap-2">{visibleParkedSales.map((sale) => <article key={sale.id} className="rounded-md border border-[var(--oh-border)] p-3">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-[var(--oh-text)]">{sale.customer?.name ?? "Walk-in customer"}</h3><p className="mt-1 text-xs text-[var(--oh-muted)]">{formatParkedDate(sale.createdAt)} · {sale.registerName}</p><p className="mt-1 text-xs text-[var(--oh-muted)]">{sale.lines.reduce((sum, line) => sum + line.quantity, 0)} items · {money(sale.lines.reduce((sum, line) => sum + line.product.list_price * line.quantity, 0))}</p></div></div>
              <p className="mt-2 line-clamp-2 text-xs text-[var(--oh-muted)]">{sale.lines.map((line) => `${line.quantity} × ${line.product.display_name || line.product.name}`).join(" · ")}</p>
              <div className="mt-3 flex gap-2"><button type="button" onClick={() => requestResumeParkedSale(sale)} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-[var(--sf-link-blue)] px-3 text-sm font-semibold text-white hover:brightness-95"><RotateCcw size={15} /> Resume</button><button type="button" onClick={() => setParkedAction({ type: "discard", saleId: sale.id })} className="h-9 rounded-md border border-[var(--oh-border)] px-3 text-sm font-medium text-[var(--oh-muted)] hover:text-red-700">Discard</button></div>
            </article>)}</div> : <div className="grid h-[60%] place-items-center text-center"><div><Archive size={24} className="mx-auto text-[var(--oh-muted)]"/><p className="mt-2 text-sm font-medium text-[var(--oh-text)]">No parked sales</p><p className="mt-1 text-xs text-[var(--oh-muted)]">Park an open cart to finish it later.</p></div></div>}
          </div>}
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
            <div className="mb-3 grid grid-cols-[1fr_1.3fr] gap-2"><label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Payment method<select value={paymentMethodId ?? ""} onChange={(event) => { setPaymentMethodId(Number(event.target.value) || null); setCashTendered(""); }} disabled={!paymentMethods.length} className="h-10 rounded-md border border-[var(--oh-border)] bg-white px-2 text-sm font-medium normal-case tracking-normal text-[var(--oh-text)]">{paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label><div className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Sale details<div className="flex h-10 items-center rounded-md bg-[var(--oh-surface)] px-3 text-sm font-medium normal-case tracking-normal text-[var(--oh-text)]">{selectedConfig?.session?.name ?? "No open session"}</div></div></div>
            {isCashPayment && <div className="mb-3 rounded-md border border-[var(--oh-border)] bg-[#fbfcfb] p-3"><label htmlFor="cash-tendered" className="flex items-center justify-between gap-3 text-sm font-medium text-[var(--oh-text)]"><span>Cash received</span><span className="text-xs font-normal text-[var(--oh-muted)]">Due {money(amountToCollect)}</span></label><div className="mt-2 flex items-center gap-2"><span className="text-sm text-[var(--oh-muted)]">$</span><input id="cash-tendered" type="number" inputMode="decimal" min={amountToCollect} max={1_000_000} step="0.01" value={cashTendered} onChange={(event) => setCashTendered(event.target.value)} placeholder={amountToCollect.toFixed(2)} className="h-10 min-w-0 flex-1 rounded-md border border-[var(--oh-border)] bg-white px-3 text-base tabular-nums text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[var(--oh-orange)]/20" /></div><div className="mt-2 flex flex-wrap gap-2">{[5, 10, 20, 50].filter((amount) => amount >= amountToCollect).slice(0, 3).map((amount) => <button key={amount} type="button" onClick={() => setCashTendered(String(amount))} className="min-h-9 rounded-md border border-[var(--oh-border)] bg-white px-3 text-xs font-medium text-[var(--oh-text)] hover:border-[var(--oh-orange)]">${amount}</button>)}<button type="button" onClick={() => setCashTendered(amountToCollect.toFixed(2))} className="min-h-9 rounded-md border border-[var(--oh-border)] bg-white px-3 text-xs font-medium text-[var(--oh-text)] hover:border-[var(--oh-orange)]">Exact</button></div><p role="status" className={`mt-2 text-sm font-semibold tabular-nums ${tenderedAmount + 0.001 < amountToCollect || !Number.isFinite(tenderedAmount) ? "text-red-700" : "text-[var(--oh-text-secondary)]"}`}>{tenderedAmount + 0.001 < amountToCollect || !Number.isFinite(tenderedAmount) ? "Cash received must cover the total." : `Change due ${money(changeDue)}`}</p></div>}
            <button type="button" onClick={() => void checkout()} disabled={!lines.length || !selectedConfig?.session || !paymentMethodId || busy || !Number.isFinite(tenderedAmount) || tenderedAmount + 0.001 < amountToCollect} className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--sf-link-blue)] text-lg font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-[#bdbdbd]">
              {busy ? <><LoaderCircle size={18} className="animate-spin" /> Processing…</> : <>Finalise · {money(amountToCollect)}</>}
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
