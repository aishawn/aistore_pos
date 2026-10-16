"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Archive, Check, CircleAlert, CircleHelp, Clock3, Keyboard, LoaderCircle, Minus, Plus, Printer, RefreshCw, RotateCcw, Search, ShoppingBag, SquareParking, Trash2, X } from "lucide-react";
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
  registerId?: number;
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
const REGISTER_SELECTION_KEY = "orithos-odoo-register-v1";
const ACTIVE_CART_KEY = "orithos-odoo-active-cart-v1";
const ACTIVE_CART_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type ActiveCartDraft = {
  lines: CartLine[];
  paymentMethodId: number | null;
  customer: { id: number; name: string } | null;
  cashTendered: string;
  savedAt: string;
};

function isParkedOdooSale(value: unknown): value is ParkedOdooSale {
  if (!value || typeof value !== "object") return false;
  const sale = value as Partial<ParkedOdooSale>;
  return typeof sale.id === "string"
    && typeof sale.ownerUserId === "string"
    && Number.isSafeInteger(sale.companyId)
    && typeof sale.companyName === "string"
    && typeof sale.registerName === "string"
    && (sale.registerId === undefined || Number.isSafeInteger(sale.registerId))
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

function isActiveCartDraft(value: unknown): value is ActiveCartDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<ActiveCartDraft>;
  return Array.isArray(draft.lines)
    && draft.lines.length > 0
    && draft.lines.every((line) => line && Number.isSafeInteger(line.product?.id) && typeof line.product?.name === "string" && Number.isFinite(line.product?.list_price) && Number.isFinite(line.quantity) && line.quantity > 0 && Number.isFinite(line.packFactor) && line.packFactor > 0)
    && (draft.paymentMethodId === null || Number.isSafeInteger(draft.paymentMethodId))
    && (draft.customer === null || (typeof draft.customer === "object" && Number.isSafeInteger(draft.customer?.id) && typeof draft.customer?.name === "string"))
    && typeof draft.cashTendered === "string"
    && typeof draft.savedAt === "string";
}

const money = (amount: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);

/** Prefer a human-readable product label; keep the full string for title tooltips. */
function friendlyProductLabel(name: string) {
  const cleaned = name
    .replace(/^\[[^\]]+\]\s*/u, "")
    .replace(/^DEMO\s*[|·\-–—]\s*/iu, "")
    .trim();
  return cleaned || name;
}

export function OdooRegisterPage() {
  const [bootstrap, setBootstrap] = useState<OdooPosBootstrap | null>(null);
  const [configId, setConfigId] = useState<number | null>(null);
  const [odooUserId, setOdooUserId] = useState<string | null>(null);
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [posCategories, setPosCategories] = useState<OdooPosCategoryRecord[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [products, setProducts] = useState<OdooProductRecord[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productRetryKey, setProductRetryKey] = useState(0);
  const [customers, setCustomers] = useState<OdooCustomerRecord[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null);
  const [customerSearchKey, setCustomerSearchKey] = useState(0);
  const [customer, setCustomer] = useState<OdooCustomerRecord | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [quote, setQuote] = useState<OdooCheckoutQuote | null>(null);
  const [quotedFingerprint, setQuotedFingerprint] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteFailure, setQuoteFailure] = useState<{ fingerprint: string; message: string } | null>(null);
  const [quoteRetryKey, setQuoteRetryKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CompletedReceipt | null>(null);
  const [cashTendered, setCashTendered] = useState("");
  const [parkedSales, setParkedSales] = useState<ParkedOdooSale[]>([]);
  const [parkedLoaded, setParkedLoaded] = useState(false);
  const [saleView, setSaleView] = useState<"sell" | "parked">("sell");
  const [parkedAction, setParkedAction] = useState<{ type: "resume" | "discard"; saleId: string } | null>(null);
  const [pendingRegisterId, setPendingRegisterId] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const orderUuid = useRef<string | null>(null);
  const checkoutFingerprint = useRef<string | null>(null);
  const quoteRevision = useRef(0);
  const searchRevision = useRef(0);
  const customerSearchRevision = useRef(0);
  const barcodeLookupBusy = useRef(false);
  const restoredDraftKey = useRef<string | null>(null);
  const [hydratedDraftKey, setHydratedDraftKey] = useState<string | null>(null);

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
      let rememberedId: number | null = null;
      try {
        const stored = Number(localStorage.getItem(`${REGISTER_SELECTION_KEY}:${user.id}`));
        if (Number.isSafeInteger(stored) && stored > 0) rememberedId = stored;
      } catch { /* Register selection remains available for this session. */ }
      const active = data.configs.find((item) => item.id === rememberedId)
        ?? data.configs.find((item) => item.session)
        ?? data.configs[0];
      setConfigId(active?.id ?? null);
      if (active) {
        try { localStorage.setItem(`${REGISTER_SELECTION_KEY}:${user.id}`, String(active.id)); } catch { /* Register selection remains available for this session. */ }
      }
      const selected = active?.paymentMethods[0]?.id ?? null;
      setPaymentMethodId(selected);
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
    const updateConnection = () => setIsOnline(navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

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
    if (!connected || !odooUserId || configId === null) return;
    const key = `${ACTIVE_CART_KEY}:${odooUserId}:${configId}`;
    if (restoredDraftKey.current === key) return;
    restoredDraftKey.current = key;
    setHydratedDraftKey(key);
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
      if (!isActiveCartDraft(parsed)) return;
      const savedAt = Date.parse(parsed.savedAt);
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > ACTIVE_CART_MAX_AGE_MS) {
        localStorage.removeItem(key);
        setDraftNotice("The saved cart draft was older than 24 hours and was discarded. Start a fresh sale.");
        return;
      }
      setLines(parsed.lines.map((line) => ({ ...line, packFactor: line.packFactor || 1 })));
      setCustomer(parsed.customer ? {
        id: parsed.customer.id,
        name: parsed.customer.name,
        phone: false,
        email: false,
        customer_rank: 0,
        ref: false,
      } : null);
      setCashTendered(parsed.cashTendered);
      const config = bootstrap?.configs.find((item) => item.id === configId);
      if (parsed.paymentMethodId && config?.paymentMethods.some((method) => method.id === parsed.paymentMethodId)) setPaymentMethodId(parsed.paymentMethodId);
      setSaleView("sell");
      setDraftNotice("Draft restored from this device. Odoo will recheck stock and tax before finalising.");
    } catch {
      setDraftNotice("A saved cart draft could not be read from this device.");
    }
  }, [bootstrap, configId, connected, odooUserId]);

  useEffect(() => {
    if (!connected || !odooUserId || configId === null) return;
    const key = `${ACTIVE_CART_KEY}:${odooUserId}:${configId}`;
    if (hydratedDraftKey !== key) return;
    try {
      if (!lines.length && !customer && !cashTendered) {
        localStorage.removeItem(key);
        return;
      }
      const draft: ActiveCartDraft = { lines, paymentMethodId, customer: customer ? { id: customer.id, name: customer.name } : null, cashTendered, savedAt: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      setDraftNotice("This device could not save the active cart draft.");
    }
  }, [cashTendered, configId, connected, customer, hydratedDraftKey, lines, odooUserId, paymentMethodId]);

  useEffect(() => {
    const revision = ++searchRevision.current;
    if (!connected) {
      setProducts([]);
      setProductsError(null);
      setProductsLoading(false);
      return;
    }
    setProducts([]);
    setProductsError(null);
    setProductsLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchOdooRecords<OdooProductRecord>("products", { query, limit: 50, categoryId: categoryId ?? undefined });
        if (revision === searchRevision.current) setProducts(result.items);
      } catch (cause) {
        if (revision === searchRevision.current) {
          setProducts([]);
          setProductsError(cause instanceof Error ? cause.message : "Product search failed.");
        }
      } finally {
        if (revision === searchRevision.current) setProductsLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, categoryId, connected, productRetryKey]);

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
    const revision = ++customerSearchRevision.current;
    const term = customerQuery.trim();
    if (!connected || !term) {
      setCustomers([]);
      setCustomerSearchError(null);
      setCustomerSearchLoading(false);
      return;
    }
    setCustomers([]);
    setCustomerSearchError(null);
    setCustomerSearchLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchOdooRecords<OdooCustomerRecord>("customers", { query: term, limit: 12 });
        if (revision === customerSearchRevision.current) setCustomers(result.items);
      } catch (cause) {
        if (revision === customerSearchRevision.current) {
          setCustomers([]);
          setCustomerSearchError(cause instanceof Error ? cause.message : "Customer search failed.");
        }
      } finally {
        if (revision === customerSearchRevision.current) setCustomerSearchLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [customerQuery, connected, customerSearchKey]);

  const selectedConfig = bootstrap?.configs.find((item) => item.id === configId) ?? null;
  const currentQuoteFingerprint = JSON.stringify({
    configId,
    paymentMethodId,
    customerId: customer?.id ?? null,
    lines: lines.map((line) => [line.product.id, line.quantity, line.packFactor || 1]),
  });
  const paymentMethods = selectedConfig?.paymentMethods ?? [];
  const selectedCompanyId = Array.isArray(selectedConfig?.company) ? selectedConfig.company[0] : null;
  const visibleParkedSales = parkedSales.filter((sale) => sale.ownerUserId === odooUserId
    && sale.companyId === selectedCompanyId
    && (sale.registerId === undefined ? sale.registerName === selectedConfig?.name : sale.registerId === configId));
  const parkedActionSale = parkedAction ? parkedSales.find((sale) => sale.id === parkedAction.saleId) : null;
  const quoteIsCurrent = Boolean(quote && quotedFingerprint === currentQuoteFingerprint);
  const quoteError = !quoteLoading && quoteFailure?.fingerprint === currentQuoteFingerprint ? quoteFailure.message : null;
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
    if (!connected || !isOnline || !selectedConfig?.session || !paymentMethodId) {
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
          setQuoteFailure(null);
          setQuoteLoading(false);
          setError(null);
        }
      }).catch((cause) => {
        if (revision === quoteRevision.current) {
          setQuote(null);
          setQuoteLoading(false);
          setQuoteFailure({
            fingerprint: currentQuoteFingerprint,
            message: cause instanceof Error ? cause.message : "Odoo could not calculate tax for this cart.",
          });
        }
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [connected, currentQuoteFingerprint, customer, isOnline, lines, paymentMethodId, quoteRetryKey, selectedConfig]);

  function formatReceiptDate(value: string) {
    const date = new Date(`${value.replace(" ", "T")}Z`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function addProduct(product: OdooProductRecord, packFactor = 1) {
    const requested = lines.filter((line) => line.product.id === product.id).reduce((sum, line) => sum + line.quantity * (line.packFactor || 1), 0) + packFactor;
    if (requested > product.free_qty + 1e-9) {
      setError(`Only ${product.free_qty} units of ${product.name} are available.`);
      return;
    }
    setError(null);
    setLines((current) => {
      const found = current.find((line) => line.product.id === product.id && (line.packFactor || 1) === packFactor);
      return found
        ? current.map((line) => line.product.id === product.id && (line.packFactor || 1) === packFactor ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { product, quantity: 1, packFactor }];
    });
  }

  function setLinePackFactor(productId: number, currentFactor: number, nextFactor: number) {
    const product = lines.find((line) => line.product.id === productId)?.product;
    const requested = lines.filter((line) => line.product.id === productId).reduce((sum, line) => sum + line.quantity * ((line.packFactor || 1) === currentFactor ? nextFactor : (line.packFactor || 1)), 0);
    if (product && requested > product.free_qty + 1e-9) {
      setError(`Only ${product.free_qty} units of ${product.name} are available.`);
      return;
    }
    setError(null);
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
    const matching = lines.filter((line) => line.product.id === productId);
    const product = matching[0]?.product;
    const requested = matching.reduce((sum, line) => sum + (line.quantity + ((line.packFactor || 1) === packFactor ? amount : 0)) * (line.packFactor || 1), 0);
    if (amount > 0 && product && requested > product.free_qty + 1e-9) {
      setError(`Only ${product.free_qty} units of ${product.name} are available.`);
      return;
    }
    setError(null);
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
    if (!lines.length || !selectedConfig || selectedCompanyId === null || !odooUserId) return false;
    if (parkedSales.length >= 50) {
      setError("This terminal has reached its 50 parked sale limit. Resume or discard an older sale first.");
      return false;
    }
    const sale: ParkedOdooSale = {
      id: crypto.randomUUID(),
      ownerUserId: odooUserId,
      companyId: selectedCompanyId,
      companyName: Array.isArray(selectedConfig.company) ? selectedConfig.company[1] : "Company",
      registerName: selectedConfig.name,
      registerId: selectedConfig.id,
      sessionName: selectedConfig.session?.name ?? "No open session",
      paymentMethodId,
      customer: customer ? { id: customer.id, name: customer.name } : null,
      lines: lines.map((line) => ({ ...line, product: { ...line.product } })),
      createdAt: new Date().toISOString(),
    };
    if (!saveParkedSales([sale, ...parkedSales])) return false;
    setLines([]);
    setCustomer(null);
    setCustomerQuery("");
    setCashTendered("");
    setSaleView("parked");
    orderUuid.current = null;
    checkoutFingerprint.current = null;
    return true;
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
    if (!isOnline || !selectedConfig?.session || !paymentMethodId || !lines.length || busy) return;
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

  if (loading) return (
    <main aria-busy="true" aria-label="Loading register" className="flex h-[calc(100dvh-50px)] min-h-0 flex-col gap-3 overflow-hidden bg-[var(--oh-surface)] p-3 sm:p-4">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3">
        <div className="h-11 w-56 animate-pulse rounded-full border border-[var(--oh-border)] bg-white" />
        <div className="h-4 w-36 animate-pulse rounded bg-slate-200" />
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 xl:flex-row">
        <section className="flex min-h-[18rem] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white p-3">
          <div className="h-11 shrink-0 animate-pulse rounded-md bg-slate-100" />
          <div className="mt-3 grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => <div key={index} className="min-h-28 animate-pulse rounded-lg border border-[var(--oh-border)] bg-slate-50" />)}
          </div>
        </section>
        <section className="flex min-h-52 flex-col overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white p-3 xl:w-[400px]">
          <div className="h-11 animate-pulse rounded-md bg-slate-100" />
          <div className="flex-1" />
          <div className="h-24 animate-pulse rounded-md bg-slate-100" />
        </section>
      </div>
    </main>
  );
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
  const canFinalise = Boolean(isOnline && lines.length && quoteIsCurrent && !quoteLoading && selectedConfig?.session && paymentMethodId && !busy && Number.isFinite(tenderedAmount) && tenderedAmount + 0.001 >= amountToCollect);
  const sessionOpen = Boolean(selectedConfig?.session);
  const sessionHint = selectedConfig?.session?.name
    ? selectedConfig.session.name
    : "No open session";

  function selectRegister(id: number) {
    setConfigId(id);
    setCashTendered("");
    setCustomer(null);
    setCustomerQuery("");
    setCategoryId(null);
    setError(null);
    setDraftNotice(null);
    const config = bootstrap?.configs.find((item) => item.id === id);
    setPaymentMethodId(config?.paymentMethods[0]?.id ?? null);
    setSaleView("sell");
    setPendingRegisterId(null);
    if (odooUserId) {
      try { localStorage.setItem(`${REGISTER_SELECTION_KEY}:${odooUserId}`, String(id)); } catch { /* Keep the current selection for this session. */ }
    }
  }

  return (
    <main className="flex h-[calc(100dvh-50px)] min-h-0 flex-col overflow-hidden bg-[var(--oh-surface)] p-3 font-sans sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div
            className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--oh-border)] bg-white py-1 pl-3 pr-1 shadow-sm"
            title={selectedConfig?.session ? `${selectedConfig.name} · ${selectedConfig.session.name}` : selectedConfig?.name}
          >
            <span className={cn("h-2 w-2 shrink-0 rounded-full", sessionOpen ? "bg-[var(--oh-success)]" : "bg-amber-500")} aria-hidden="true" />
            <select
              aria-label="Register"
              value={configId ?? ""}
              disabled={busy || refreshing}
              onChange={(event) => {
                const id = Number(event.target.value);
                if (id === configId) return;
                if (lines.length) setPendingRegisterId(id);
                else selectRegister(id);
              }}
              className="max-w-[200px] truncate border-0 bg-transparent py-1 text-sm font-semibold text-[var(--oh-text)] outline-none"
            >
              {bootstrap?.configs.map((config) => (
                <option key={config.id} value={config.id}>{config.name}{config.session ? "" : " · Closed"}</option>
              ))}
            </select>
            <span className="hidden truncate text-xs text-[var(--oh-text-secondary)] sm:inline">{sessionOpen ? "Open" : "Closed"}</span>
            <button type="button" onClick={() => void loadPos()} disabled={refreshing} title="Refresh register data" aria-label="Refresh register data" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] disabled:opacity-60">
              {refreshing ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            </button>
            <button type="button" onClick={() => setHelpOpen(true)} title="POS help and recovery" aria-label="POS help and recovery" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]">
              <CircleHelp size={17} />
            </button>
          </div>
          {lines.length > 0 && (
            <button type="button" onClick={parkCurrentSale} disabled={!parkedLoaded || !selectedConfig || busy} className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] shadow-sm hover:bg-[var(--oh-orange-light)] disabled:opacity-50">
              <Archive size={15} /> Park
            </button>
          )}
        </div>
        <p className="truncate text-xs text-[var(--oh-text-secondary)]" title={sessionHint}>{sessionHint}</p>
      </div>

      {!selectedConfig?.session && (
        <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          <span>No open session — open one in Odoo, then refresh.</span>
          <a href="https://odoo.orithos.com.au/odoo/point-of-sale" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-[var(--sf-cta)] px-3 font-semibold text-white hover:bg-[var(--sf-cta-hover)]">Open Odoo POS</a>
        </div>
      )}
      {!isOnline && (
        <div role="status" aria-live="polite" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          <span>Offline — this register cannot complete sales until the connection returns. Your current cart stays on this device.</span>
          <span className="shrink-0 font-semibold">Reconnect to continue</span>
        </div>
      )}
      {draftNotice && (
        <div role="status" aria-live="polite" className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-950">
          <span>{draftNotice}</span>
          <button type="button" onClick={() => setDraftNotice(null)} aria-label="Dismiss draft notice" className="grid h-11 w-11 shrink-0 place-items-center rounded-md hover:bg-blue-100"><X size={16} /></button>
        </div>
      )}
      {busy && (
        <div role="status" aria-live="polite" className="slow-status mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          Odoo is still confirming this sale. Keep this window open and do not submit the sale again.
        </div>
      )}
      {error && (
        <div role="alert" className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="grid h-11 w-11 shrink-0 place-items-center rounded-md font-bold hover:bg-red-100">×</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 xl:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
          {saleView === "sell" ? (
            <>
              <div role="group" aria-label="Search and filter POS products" className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--oh-border)] px-3 sm:px-4">
                <Search size={18} className="shrink-0 text-[var(--sf-placeholder)]" />
                <input
                  aria-label="Search products by name, barcode or code"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => void handleProductSearchKeyDown(event)}
                  placeholder="Search products or scan a barcode…"
                  className="h-full min-w-0 flex-1 bg-transparent text-base text-[var(--oh-text)] outline-none placeholder:text-[var(--sf-placeholder)]"
                />
                {productsLoading && <LoaderCircle size={16} className="animate-spin text-[var(--sf-placeholder)]" />}
                <select
                  aria-label="POS category"
                  value={categoryId ?? ""}
                  onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : null)}
                  className="hidden h-11 max-w-[160px] rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-2 text-xs font-medium text-[var(--oh-text)] sm:block"
                >
                  <option value="">All categories</option>
                  {posCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {Array.isArray(category.parent_id)
                        ? `${friendlyProductLabel(category.parent_id[1])} / ${friendlyProductLabel(category.name)}`
                        : friendlyProductLabel(category.name)}
                    </option>
                  ))}
                </select>
              </div>
              {categoriesError && <p role="status" className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">{categoriesError}</p>}
              <div className="relative min-h-0 flex-1 overflow-y-auto bg-[var(--sf-pad-bg)] p-3">
                {productsLoading && <p role="status" className="slow-status mb-2 text-xs text-[var(--oh-muted)]">Still waiting for products from Odoo…</p>}
                {productsLoading && !products.length ? (
                  <div aria-label="Loading products" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {Array.from({ length: 8 }, (_, index) => <div key={index} className="min-h-28 animate-pulse rounded-lg border border-[var(--oh-border)] bg-white" />)}
                  </div>
                ) : productsError ? (
                  <div role="alert" className="grid h-full min-h-48 place-items-center px-5 text-center">
                    <div className="max-w-sm">
                      <CircleAlert size={26} className="mx-auto text-red-700" />
                      <p className="mt-2 font-semibold text-[var(--oh-text)]">Products could not load</p>
                      <p className="mt-1 text-sm text-[var(--oh-muted)]">{productsError}</p>
                      <button type="button" onClick={() => setProductRetryKey((value) => value + 1)} disabled={productsLoading} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-4 text-sm font-semibold text-[var(--oh-text)] disabled:opacity-60">
                        <RefreshCw size={15} /> Retry search
                      </button>
                    </div>
                  </div>
                ) : products.length ? (
                  <div className="flex min-h-full flex-col">
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                      {products.map((product) => {
                        const fullName = product.display_name || product.name;
                        const label = friendlyProductLabel(fullName);
                        const initial = (label.replace(/[^A-Za-z0-9]/gu, "").charAt(0) || "?").toUpperCase();
                        return (
                          <button
                            key={product.id}
                            type="button"
                            title={fullName}
                            onClick={() => addProduct(product)}
                            disabled={!selectedConfig?.session || product.free_qty <= 0}
                            className="flex min-h-[112px] flex-col rounded-xl border border-[var(--oh-border)] bg-white p-3 text-left shadow-sm transition-colors hover:border-[var(--oh-primary)]/45 hover:bg-[var(--oh-orange-light)] disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <span className="oh-type-label mb-2 grid h-9 w-9 place-items-center rounded-full bg-[var(--oh-orange-light)] font-bold text-[var(--oh-primary)]" aria-hidden="true">
                              {initial}
                            </span>
                            <span className="oh-type-body line-clamp-2 font-semibold leading-5 text-[var(--oh-text)]">{label}</span>
                            <span className="oh-type-body-strong mt-auto pt-2 tabular-nums text-[var(--oh-text)]">{money(product.price_included ?? product.list_price)}</span>
                            <span className="oh-type-label text-[var(--oh-text-secondary)]">
                              {product.price_included === null ? "Ex GST · tax quote unavailable" : product.price_tax === null ? "Tax status unavailable" : product.price_tax > 0 ? "Incl. GST" : "GST-free"}
                            </span>
                            <span className={cn("oh-type-label mt-0.5", product.free_qty > 0 ? "text-[var(--oh-text-secondary)]" : "font-medium text-amber-800")}>
                              {product.free_qty > 0
                                ? `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(product.free_qty)} avail.`
                                : "No stock"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {products.length < 8 && (
                      <p className="mt-auto pt-8 text-center text-sm text-[var(--oh-text-secondary)]">
                        Search or tap a product to start
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid h-full place-items-center px-5 text-center text-sm text-[var(--oh-text-secondary)]">
                    {productsLoading ? "Loading products…" : (
                      <div>
                        <Search size={28} className="mx-auto mb-2 text-[var(--oh-border-strong)]" />
                        <p className="font-medium text-[var(--oh-text)]">No products here</p>
                        <p className="mt-1">Search or scan a barcode to find stock.</p>
                        {(query || categoryId !== null) && (
                          <button type="button" onClick={() => { setQuery(""); setCategoryId(null); }} className="mt-3 font-semibold text-[var(--sf-tab-blue)] underline underline-offset-2">Clear filters</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--sf-pad-bg)] p-3">
              <p className="mb-3 flex items-start gap-2 rounded-xl border border-[var(--oh-border)] bg-white p-3 text-xs leading-5 text-[var(--oh-text-secondary)]">
                <Clock3 size={15} className="mt-0.5 shrink-0" />
                Parked sales are saved on this terminal.
              </p>
              {visibleParkedSales.length ? (
                <div className="grid gap-2">
                  {visibleParkedSales.map((sale) => (
                    <article key={sale.id} className="rounded-xl border border-[var(--oh-border)] bg-white p-3 shadow-sm">
                      <h3 className="truncate text-sm font-semibold text-[var(--oh-text)]">{sale.customer?.name ?? "Walk-in customer"}</h3>
                      <p className="mt-1 text-xs text-[var(--oh-text-secondary)]">{formatParkedDate(sale.createdAt)} · {sale.registerName}</p>
                      <p className="mt-1 text-xs text-[var(--oh-text-secondary)]">
                        {sale.lines.reduce((sum, line) => sum + line.quantity, 0)} items · {money(sale.lines.reduce((sum, line) => sum + line.product.list_price * line.quantity * (line.packFactor || 1), 0))}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => requestResumeParkedSale(sale)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[var(--sf-cta)] px-3 text-sm font-semibold text-white hover:bg-[var(--sf-cta-hover)]"><RotateCcw size={15} /> Resume</button>
                        <button type="button" onClick={() => setParkedAction({ type: "discard", saleId: sale.id })} className="h-11 rounded-md border border-[var(--oh-border)] px-3 text-sm font-medium text-[var(--oh-text-secondary)] hover:text-red-700">Discard</button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="grid h-[60%] place-items-center text-center">
                  <div>
                    <Archive size={24} className="mx-auto text-[var(--oh-border-strong)]" />
                    <p className="mt-2 text-sm font-medium text-[var(--oh-text)]">No parked sales</p>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="shrink-0 border-t border-[var(--oh-border)] bg-white p-2">
            <div className="flex rounded-lg bg-[var(--oh-surface)] p-1" role="tablist" aria-label="Sell views">
              <button
                type="button"
                role="tab"
                aria-selected={saleView === "sell"}
                onClick={() => setSaleView("sell")}
                className={cn(
                  "oh-type-body flex h-11 flex-1 items-center justify-center gap-2 rounded-md font-semibold transition-colors",
                  saleView === "sell" ? "bg-white text-[var(--oh-primary)] shadow-sm" : "text-[var(--oh-text-secondary)] hover:text-[var(--oh-text)]",
                )}
              >
                <Keyboard size={18} strokeWidth={1.75} /> Sales Keys
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={saleView === "parked"}
                onClick={() => setSaleView("parked")}
                className={cn(
                  "oh-type-body relative flex h-11 flex-1 items-center justify-center gap-2 rounded-md font-semibold transition-colors",
                  saleView === "parked" ? "bg-white text-[var(--oh-primary)] shadow-sm" : "text-[var(--oh-text-secondary)] hover:text-[var(--oh-text)]",
                )}
              >
                <SquareParking size={18} strokeWidth={1.75} /> Parked
                {visibleParkedSales.length > 0 && (
                  <span className="oh-type-label inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--oh-primary)] px-1.5 font-bold text-white">
                    {visibleParkedSales.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </section>

        <section className="flex w-full min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] xl:w-[400px] xl:shrink-0">
          <div className="flex h-14 shrink-0 items-center border-b border-[var(--oh-border)] px-1">
            {customer ? (
              <>
                <button type="button" onClick={() => setCustomerQuery(customer.name)} className="flex flex-1 cursor-pointer items-center text-left">
                  <span className="oh-type-body ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--oh-primary)] font-bold text-white">{customer.name.charAt(0)}</span>
                  <span className="oh-type-body-strong mx-2 truncate text-[var(--oh-text)]">{customer.name}</span>
                </button>
                <button type="button" aria-label="Remove customer" onClick={() => setCustomer(null)} className="mr-2 grid h-11 w-11 place-items-center rounded-md text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]"><X size={18} /></button>
              </>
            ) : (
              <label className="flex h-full flex-1 cursor-text items-center">
                <PlusIcon size={18} strokeWidth={1.5} className="ml-3 mr-2 shrink-0 text-[var(--oh-primary)]" />
                <input
                  value={customerQuery}
                  onChange={(event) => { setCustomers([]); setCustomerQuery(event.target.value); }}
                  placeholder="Add customer"
                  className="oh-type-body-strong h-full min-w-0 flex-1 bg-transparent text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-text-secondary)]"
                />
              </label>
            )}
          </div>
          {!customer && customerSearchLoading && <p role="status" className="shrink-0 border-b border-[var(--oh-border)] px-4 py-2 text-xs text-[var(--oh-muted)]">Searching customers…</p>}
          {!customer && customerSearchError && <div role="alert" className="flex shrink-0 items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"><span>{customerSearchError}</span><button type="button" onClick={() => setCustomerSearchKey((value) => value + 1)} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md border border-red-300 bg-white px-2 font-semibold"><RefreshCw size={13} /> Retry</button></div>}
          {!customer && customers.length > 0 && (
            <div className="max-h-36 shrink-0 overflow-y-auto border-b border-[var(--oh-border)]">
              {customers.map((item) => (
                <button key={item.id} type="button" onClick={() => { customerSearchRevision.current += 1; setCustomerSearchLoading(false); setCustomerSearchError(null); setCustomer(item); setCustomers([]); setCustomerQuery(""); }} className="block w-full border-b border-[var(--oh-border)] px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-[var(--oh-orange-light)]">
                  {item.name}<span className="ml-2 text-xs text-[var(--oh-text-secondary)]">{item.phone || item.email}</span>
                </button>
              ))}
            </div>
          )}
          {!customer && customerQuery.trim() && !customerSearchLoading && !customerSearchError && !customers.length && <p role="status" className="shrink-0 border-b border-[var(--oh-border)] px-4 py-2 text-xs text-[var(--oh-muted)]">No matching customers</p>}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {lines.length ? lines.map(({ product, quantity: qty, packFactor }) => {
              const factor = packFactor || 1;
              const quotedLine = quoteIsCurrent ? quote?.lines.find((line) => line.productId === product.id && line.uomFactor === factor) : undefined;
              const lineTotal = splitMoney(quotedLine?.total ?? product.list_price * qty * factor);
              const unitPrice = quotedLine ? quotedLine.total / qty : product.list_price * factor;
              const fullName = product.display_name || product.name;
              const label = friendlyProductLabel(fullName);
              return (
                <div key={`${product.id}-${factor}`} className="flex flex-col gap-2 border-b border-[var(--oh-border)] px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <span className="oh-type-body mt-0.5 w-7 shrink-0 font-semibold tabular-nums text-[var(--oh-text-secondary)]">{qty}×</span>
                    <span className="min-w-0 flex-1">
                      <span className="oh-type-body block truncate font-semibold text-[var(--oh-text)]" title={fullName}>{label}</span>
                      <span className="oh-type-label text-[var(--oh-text-secondary)]">
                        {factor > 1
                          ? `${money(unitPrice)} / case · ${factor}`
                          : `${money(unitPrice)} each`}
                        {quotedLine ? " · GST" : ""}
                      </span>
                    </span>
                    <span className="oh-type-body-strong shrink-0 tabular-nums text-[var(--oh-text)]">${lineTotal.whole}.{lineTotal.cents}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-9">
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label={`Decrease ${product.name}`} onClick={() => changeQuantity(product.id, factor, -1)} className="grid h-11 w-11 place-items-center rounded-md border border-[var(--oh-border)]"><Minus size={15} /></button>
                      <button type="button" aria-label={`Increase ${product.name}`} onClick={() => changeQuantity(product.id, factor, 1)} className="grid h-11 w-11 place-items-center rounded-md border border-[var(--oh-border)]"><Plus size={15} /></button>
                      <button type="button" aria-label={`Remove ${product.name}`} onClick={() => setLines((current) => current.filter((line) => !(line.product.id === product.id && (line.packFactor || 1) === factor)))} className="grid h-11 w-11 place-items-center rounded-md text-[var(--oh-text-secondary)] hover:text-red-600"><Trash2 size={16} /></button>
                    </div>
                    <label className="oh-type-label flex items-center gap-2 text-[var(--oh-text-secondary)]">Pack
                      <select aria-label={`Pack size for ${product.name}`} value={factor} onChange={(event) => setLinePackFactor(product.id, factor, Number(event.target.value))} className="oh-type-label h-11 rounded-md border border-[var(--oh-border)] bg-white px-2 font-semibold text-[var(--oh-text)]">
                        {CASE_PACK_OPTIONS.map((size) => <option key={size} value={size}>{size === 1 ? "Each" : `Case ×${size}`}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              );
            }) : (
              <div className="grid h-full min-h-[180px] place-items-center px-6 text-center">
                <div>
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--oh-orange-light)] text-[var(--oh-primary)]">
                    <ShoppingBag size={24} aria-hidden="true" />
                  </span>
                  <p className="oh-type-body-strong mt-3 text-[var(--oh-text)]">Cart is empty</p>
                  <p className="oh-type-label mt-1 text-[var(--oh-text-secondary)]">Tap a product to start.</p>
                </div>
              </div>
            )}
          </div>

          <div className="relative shrink-0 border-t border-[var(--oh-border)] bg-[var(--oh-surface)]/60">
            {(isCashPayment || paymentMethods.length > 1) && (
              <div className="border-b border-[var(--oh-border)] px-4 py-3">
                <label className="oh-type-label grid gap-1.5 font-semibold text-[var(--oh-text-secondary)]">Payment
                  <select value={paymentMethodId ?? ""} onChange={(event) => { setPaymentMethodId(Number(event.target.value) || null); setCashTendered(""); }} disabled={!paymentMethods.length} className="oh-type-body h-11 rounded-md border border-[var(--oh-border)] bg-white px-2 font-medium text-[var(--oh-text)]">
                    {paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
                  </select>
                </label>
                {isCashPayment && (
                  <div className="mt-2">
                    <label htmlFor="cash-tendered" className="oh-type-body flex items-center justify-between text-[var(--oh-text)]"><span>Cash received</span><span className="oh-type-label text-[var(--oh-text-secondary)]">Due {money(amountToCollect)}</span></label>
                    <input id="cash-tendered" type="number" inputMode="decimal" min={amountToCollect} max={1_000_000} step="0.01" value={cashTendered} onChange={(event) => setCashTendered(event.target.value)} placeholder={amountToCollect.toFixed(2)} className="oh-type-body-strong mt-1 h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-2 tabular-nums outline-none focus:border-[var(--sf-cta)] focus:ring-2 focus:ring-[var(--sf-cta)]/20" />
                    {Number.isFinite(tenderedAmount) && tenderedAmount + 0.001 >= amountToCollect && <p className="oh-type-body mt-1 tabular-nums text-[var(--oh-text-secondary)]">Change {money(changeDue)}</p>}
                  </div>
                )}
              </div>
            )}
            <div className="px-4 py-3">
              <div className="flex items-end justify-between gap-3">
                <div className={cn("oh-type-label", lines.length ? "text-[var(--oh-text-secondary)]" : "text-[var(--oh-placeholder)]")}>
                  <p className="oh-type-body font-semibold text-[var(--oh-text)]">{quantity} {quantity === 1 ? "item" : "items"}</p>
                  <p className="mt-0.5">Subtotal {money(subtotal)}</p>
                  <p>GST {quoteLoading ? "…" : money(taxTotal)}</p>
                  {quoteLoading && <p role="status" className="slow-status mt-1 max-w-48 text-xs text-amber-800">Odoo is taking longer to calculate tax and total.</p>}
                  {quoteError && connected && isOnline && selectedConfig?.session && paymentMethodId && lines.length > 0 && (
                    <div role="alert" className="mt-2 grid gap-1.5 text-left text-xs text-red-800">
                      <span>{quoteError}</span>
                      <button type="button" onClick={() => { setQuoteFailure(null); setQuoteRetryKey((value) => value + 1); }} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-red-300 bg-white px-3 font-semibold text-red-900 hover:bg-red-50">
                        <RefreshCw size={14} /> Retry quote
                      </button>
                    </div>
                  )}
                  {amountToCollect !== total && <p>Rounding {money(amountToCollect - total)}</p>}
                </div>
                <div className={cn("text-right", lines.length ? "text-[var(--oh-text)]" : "text-[var(--oh-placeholder)]")}>
                  <p className="oh-type-label font-semibold text-[var(--oh-text-secondary)]">Total</p>
                  <p className="leading-none">
                    <span className="oh-type-display">${totalWhole}</span>
                    <span className="align-top text-[1.375rem] font-bold">.{totalCents}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void checkout()}
                disabled={!canFinalise}
                className={cn(
                  "oh-type-body-strong mt-3 inline-flex h-14 w-full items-center justify-center rounded-lg transition-colors",
                  canFinalise
                    ? "bg-[var(--oh-primary)] text-white hover:bg-[var(--oh-primary-hover)]"
                    : "cursor-not-allowed bg-[var(--oh-border)] text-[var(--oh-text-secondary)]",
                )}
              >
                {busy ? "Processing…" : !isOnline ? "Reconnect to finalise" : quoteLoading ? "Calculating…" : !selectedConfig?.session ? "No session" : "Finalise"}
              </button>
            </div>
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
          <p className="mt-5 text-center text-[13px] text-[var(--oh-muted)]">Thank you for shopping with us.</p>
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
      {pendingRegisterId !== null && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
        <section role="alertdialog" aria-modal="true" aria-labelledby="register-change-title" aria-describedby="register-change-description" className="w-full max-w-md rounded-lg border border-[var(--oh-border)] bg-white p-6 shadow-2xl">
          <h2 id="register-change-title" className="text-lg font-semibold text-[var(--oh-text)]">Park this sale before switching?</h2>
          <p id="register-change-description" className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">The current cart belongs to {selectedConfig?.name ?? "this register"}. It will be saved on this terminal and will only appear when you return to that register.</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setPendingRegisterId(null)} className="h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)]">Stay here</button>
            <button type="button" onClick={() => { const nextId = pendingRegisterId; if (parkCurrentSale() && nextId !== null) selectRegister(nextId); }} className="h-11 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Park &amp; switch</button>
          </div>
        </section>
      </div>}
      {helpOpen && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="pos-help-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-2xl sm:p-6">
          <header className="flex items-start justify-between gap-4 border-b border-[var(--oh-border)] pb-4">
            <div><h2 id="pos-help-title" className="text-lg font-semibold text-[var(--oh-text)]">POS help and recovery</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Steps for the current register screen.</p></div>
            <button type="button" onClick={() => setHelpOpen(false)} aria-label="Close POS help" className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)]"><X size={18} /></button>
          </header>
          <div className="mt-5 grid gap-4 text-sm leading-6 text-[var(--oh-text-secondary)]">
            <section><h3 className="font-semibold text-[var(--oh-text)]">Payment is still processing</h3><p className="mt-1">Keep this page open and do not submit again. Check Sales History before retrying if the result is unknown.</p></section>
            <section><h3 className="font-semibold text-[var(--oh-text)]">Tax or total could not be calculated</h3><p className="mt-1">Use Retry quote with the same cart. Finalise stays locked until Odoo returns a fresh total.</p></section>
            <section><h3 className="font-semibold text-[var(--oh-text)]">Connection is offline</h3><p className="mt-1">The cart remains on this device. Reconnect, wait for the online indicator, then retry the quote before finalising.</p></section>
            <section><h3 className="font-semibold text-[var(--oh-text)]">Register is closed or products are missing</h3><p className="mt-1">Refresh after opening the matching Odoo POS session. Product availability comes from the selected register&apos;s Odoo inventory context.</p></section>
          </div>
        </section>
      </div>}
    </main>
  );
}
