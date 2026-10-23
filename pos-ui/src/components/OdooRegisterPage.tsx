"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Archive, Check, CircleAlert, CircleHelp, Clock3, DoorClosed, History, LayoutGrid, List, LoaderCircle, Minus, Plus, Printer, RefreshCw, RotateCcw, Search, Trash2, X } from "lucide-react";
import { useCloseRegisterUiOptional } from "@/components/CloseRegisterUiProvider";
import { useSalesHistoryUiOptional } from "@/components/SalesHistoryUiProvider";
import { ODOO_REGISTER_CLOSED_EVENT } from "@/components/OdooCloseRegisterForm";
import {
  getOdooPosBootstrap,
  getOdooSession,
  quoteOdooPosOrder,
  searchOdooRecords,
  submitOdooPosOrder,
  recoverOdooPosOrder,
  OdooCheckoutPendingError,
  type OdooCheckoutRequest,
  type OdooCustomerRecord,
  type OdooCheckoutQuote,
  type OdooPosBootstrap,
  type OdooPosCategoryRecord,
  type OdooProductRecord,
} from "@/lib/odoo-api";
import { CartIcon, KeyboardIcon, ParkingIcon, PlusIcon } from "@/components/icons";
import { AdminNavyButton, AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { ProductImage } from "@/components/ProductImage";
import { cn } from "@/lib/utils";
import { friendlyProductName } from "@/lib/product-display-name";
import { splitMoney } from "@/lib/sell-screen";
import { formatOdooDateTime } from "@/lib/odoo-date";
import { useDialogFocus } from "@/hooks/useDialogFocus";

type WorkspaceTab = "keys" | "parked" | "more";

const CATEGORY_TILE_TONES = [
  { bg: "var(--oh-tile-orange-bg)", border: "var(--oh-tile-orange-border)", text: "var(--oh-tile-orange-text)" },
  { bg: "var(--oh-tile-red-bg)", border: "var(--oh-tile-red-border)", text: "var(--oh-tile-red-text)" },
  { bg: "var(--oh-tile-blue-bg)", border: "var(--oh-tile-blue-border)", text: "var(--oh-tile-blue-text)" },
  { bg: "var(--oh-tile-green-bg)", border: "var(--oh-tile-green-border)", text: "var(--oh-tile-green-text)" },
] as const;

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
  timezone?: string;
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
  timezone: string;
};

const PARKED_SALES_KEY = "orithos-odoo-parked-sales-v1";
const REGISTER_SELECTION_KEY = "orithos-odoo-register-v1";
const ACTIVE_CART_KEY = "orithos-odoo-active-cart-v1";
const ACTIVE_CART_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PRODUCT_PAGE_SIZE = 50;
const HIDE_OOS_KEY = "orithos-odoo-hide-oos-v1";
const CATALOG_DENSITY_KEY = "orithos-odoo-catalog-density-v1";

type CatalogDensity = "grid" | "list";

function shelfUnitPrice(product: OdooProductRecord): number | null {
  return product.price_included;
}

function provisionalLineUnit(product: OdooProductRecord, packFactor: number): number {
  const unit = shelfUnitPrice(product);
  return (unit ?? product.list_price) * packFactor;
}

function formatStockQty(qty: number) {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(qty);
}

type ActiveCartDraft = {
  pendingOrder?: OdooCheckoutRequest | null;
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
    && (sale.timezone === undefined || typeof sale.timezone === "string")
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

export function OdooRegisterPage() {
  const [bootstrap, setBootstrap] = useState<OdooPosBootstrap | null>(null);
  const [configId, setConfigId] = useState<number | null>(null);
  const [odooUserId, setOdooUserId] = useState<string | null>(null);
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [posCategories, setPosCategories] = useState<OdooPosCategoryRecord[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoryRetryKey, setCategoryRetryKey] = useState(0);
  const [products, setProducts] = useState<OdooProductRecord[]>([]);
  const [productsHasNext, setProductsHasNext] = useState(false);
  const [productsLoadingMore, setProductsLoadingMore] = useState(false);
  const [productActiveIndex, setProductActiveIndex] = useState(-1);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productRetryKey, setProductRetryKey] = useState(0);
  const [hideOutOfStock, setHideOutOfStock] = useState(true);
  const [catalogDensity, setCatalogDensity] = useState<CatalogDensity>("grid");
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const [customers, setCustomers] = useState<OdooCustomerRecord[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null);
  const [customerSearchKey, setCustomerSearchKey] = useState(0);
  const [customerActiveIndex, setCustomerActiveIndex] = useState(-1);
  const [customer, setCustomer] = useState<OdooCustomerRecord | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [quote, setQuote] = useState<OdooCheckoutQuote | null>(null);
  const [quotedFingerprint, setQuotedFingerprint] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteFailure, setQuoteFailure] = useState<{ fingerprint: string; message: string } | null>(null);
  const [quoteRetryKey, setQuoteRetryKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState<OdooCheckoutRequest | null>(null);
  const [confirmedPaymentKey, setConfirmedPaymentKey] = useState<string | null>(null);
  const checkoutBusy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CompletedReceipt | null>(null);
  const [cashTendered, setCashTendered] = useState("");
  const [parkedSales, setParkedSales] = useState<ParkedOdooSale[]>([]);
  const [parkedLoaded, setParkedLoaded] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("keys");
  const [catalogHome, setCatalogHome] = useState(true);
  const [selectedLineKey, setSelectedLineKey] = useState<string | null>(null);
  const [exactCashArmed, setExactCashArmed] = useState(false);
  const [clearSaleConfirm, setClearSaleConfirm] = useState(false);
  const [parkedAction, setParkedAction] = useState<{ type: "resume" | "discard"; saleId: string } | null>(null);
  const [pendingRegisterId, setPendingRegisterId] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [closeRegisterCartWarn, setCloseRegisterCartWarn] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const { openCloseRegister } = useCloseRegisterUiOptional();
  const { openSalesHistory } = useSalesHistoryUiOptional();
  const orderUuid = useRef<string | null>(null);
  const checkoutFingerprint = useRef<string | null>(null);
  const quoteRevision = useRef(0);
  const loadRevision = useRef(0);
  const searchRevision = useRef(0);
  const customerSearchRevision = useRef(0);
  const barcodeLookupBusy = useRef(false);
  const restoredDraftKey = useRef<string | null>(null);
  const registerSelectRef = useRef<HTMLSelectElement | null>(null);
  const selectedConfigIdRef = useRef<number | null>(null);
  const selectedPaymentMethodIdRef = useRef<number | null>(null);
  const [hydratedDraftKey, setHydratedDraftKey] = useState<string | null>(null);

  const loadPos = useCallback(async (initial = false) => {
    const revision = ++loadRevision.current;
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const user = await getOdooSession();
      if (revision !== loadRevision.current) return;
      setConnected(Boolean(user));
      setOdooUserId(user?.id ?? null);
      if (!user) {
        setBootstrap(null);
        selectedConfigIdRef.current = null;
        selectedPaymentMethodIdRef.current = null;
        setConfigId(null);
        setPaymentMethodId(null);
        return;
      }
      const data = await getOdooPosBootstrap();
      if (revision !== loadRevision.current) return;
      setBootstrap(data);
      let rememberedId: number | null = null;
      try {
        const stored = Number(localStorage.getItem(`${REGISTER_SELECTION_KEY}:${user.id}`));
        if (Number.isSafeInteger(stored) && stored > 0) rememberedId = stored;
      } catch { /* Register selection remains available for this session. */ }
      const active = data.configs.find((item) => item.id === selectedConfigIdRef.current)
        ?? data.configs.find((item) => item.id === rememberedId)
        ?? data.configs.find((item) => item.session)
        ?? data.configs[0];
      selectedConfigIdRef.current = active?.id ?? null;
      setConfigId(active?.id ?? null);
      if (active) {
        try { localStorage.setItem(`${REGISTER_SELECTION_KEY}:${user.id}`, String(active.id)); } catch { /* Register selection remains available for this session. */ }
      }
      const selected = active?.paymentMethods.some((method) => method.id === selectedPaymentMethodIdRef.current)
        ? selectedPaymentMethodIdRef.current
        : active?.paymentMethods[0]?.id ?? null;
      selectedPaymentMethodIdRef.current = selected;
      setPaymentMethodId(selected);
      if (data.message) setError(data.message);
    } catch (cause) {
      if (revision !== loadRevision.current) return;
      if (initial) setConnected(null);
      setError(cause instanceof Error ? cause.message : "Could not load the Odoo register.");
    } finally {
      if (revision === loadRevision.current) {
        setLoading(false);
        setRefreshing(false);
      }
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
    try {
      const hideOos = localStorage.getItem(HIDE_OOS_KEY);
      if (hideOos === "0") setHideOutOfStock(false);
      else if (hideOos === "1") setHideOutOfStock(true);
      const density = localStorage.getItem(CATALOG_DENSITY_KEY);
      if (density === "list" || density === "grid") setCatalogDensity(density);
    } catch {
      /* Preferences stay at defaults when storage is unavailable. */
    }
    setPrefsHydrated(true);
  }, []);

  useEffect(() => {
    if (!prefsHydrated) return;
    try {
      localStorage.setItem(HIDE_OOS_KEY, hideOutOfStock ? "1" : "0");
      localStorage.setItem(CATALOG_DENSITY_KEY, catalogDensity);
    } catch {
      /* Preference persistence is best-effort. */
    }
  }, [catalogDensity, hideOutOfStock, prefsHydrated]);

  useEffect(() => {
    const onRegisterClosed = () => { void loadPos(); };
    window.addEventListener(ODOO_REGISTER_CLOSED_EVENT, onRegisterClosed);
    return () => window.removeEventListener(ODOO_REGISTER_CLOSED_EVENT, onRegisterClosed);
  }, [loadPos]);

  function requestCloseRegister() {
    if (lines.length > 0) {
      setCloseRegisterCartWarn(true);
      return;
    }
    openCloseRegister();
  }

  const dialogOpen = helpOpen || closeRegisterCartWarn || clearSaleConfirm || Boolean(receipt) || Boolean(parkedAction) || pendingRegisterId !== null;
  useDialogFocus(dialogOpen, () => {
    if (helpOpen) setHelpOpen(false);
    else if (closeRegisterCartWarn) setCloseRegisterCartWarn(false);
    else if (clearSaleConfirm) setClearSaleConfirm(false);
    else if (parkedAction) setParkedAction(null);
    else if (pendingRegisterId !== null) setPendingRegisterId(null);
    else if (receipt) setReceipt(null);
  }, undefined, undefined, registerSelectRef);

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
      if ((!Number.isFinite(savedAt) || Date.now() - savedAt > ACTIVE_CART_MAX_AGE_MS) && !parsed.pendingOrder) {
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
      if (parsed.pendingOrder && parsed.pendingOrder.configId === configId && typeof parsed.pendingOrder.orderUuid === "string") {
        setPendingCheckout(parsed.pendingOrder);
        orderUuid.current = parsed.pendingOrder.orderUuid;
      }
      const config = bootstrap?.configs.find((item) => item.id === configId);
      if (parsed.paymentMethodId && config?.paymentMethods.some((method) => method.id === parsed.paymentMethodId)) {
        selectedPaymentMethodIdRef.current = parsed.paymentMethodId;
        setPaymentMethodId(parsed.paymentMethodId);
      }
      setWorkspaceTab("keys");
      setCatalogHome(true);
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
      const draft: ActiveCartDraft = { lines, paymentMethodId, customer: customer ? { id: customer.id, name: customer.name } : null, cashTendered, pendingOrder: pendingCheckout, savedAt: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      setDraftNotice("This device could not save the active cart draft.");
    }
  }, [cashTendered, configId, connected, customer, hydratedDraftKey, lines, odooUserId, paymentMethodId, pendingCheckout]);

  useEffect(() => {
    if (!prefsHydrated) return;
    const revision = ++searchRevision.current;
    setProductActiveIndex(-1);
    setProductsHasNext(false);
    if (!connected) {
      setProducts([]);
      setProductsError(null);
      setProductsLoading(false);
      setProductsLoadingMore(false);
      return;
    }
    // Keep the previous grid visible while the debounced search returns to avoid flash-empty.
    setProductsError(null);
    setProductsLoading(true);
    setProductsLoadingMore(false);
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchOdooRecords<OdooProductRecord>("products", {
          query,
          limit: PRODUCT_PAGE_SIZE,
          offset: 0,
          categoryId: categoryId ?? undefined,
          stockOnly: hideOutOfStock || undefined,
        });
        if (revision === searchRevision.current) {
          setProducts(result.items);
          setProductsHasNext(Boolean(result.hasNext));
        }
      } catch (cause) {
        if (revision === searchRevision.current) {
          setProducts([]);
          setProductsHasNext(false);
          setProductsError(cause instanceof Error ? cause.message : "Product search failed.");
        }
      } finally {
        if (revision === searchRevision.current) setProductsLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, categoryId, connected, productRetryKey, hideOutOfStock, prefsHydrated]);

  useEffect(() => {
    if (!connected) {
      setPosCategories([]);
      setCategoriesError(null);
      setCategoriesLoading(false);
      return;
    }
    let cancelled = false;
    setCategoriesLoading(true);
    setCategoriesError(null);
    void searchOdooRecords<OdooPosCategoryRecord>("posCategories", { limit: 100 })
      .then((result) => { if (!cancelled) { setPosCategories(result.items); setCategoriesError(null); } })
      .catch((cause) => { if (!cancelled) setCategoriesError(cause instanceof Error ? cause.message : "Product categories could not be loaded."); })
      .finally(() => { if (!cancelled) setCategoriesLoading(false); });
    return () => { cancelled = true; };
  }, [categoryRetryKey, connected]);

  useEffect(() => {
    const revision = ++customerSearchRevision.current;
    const term = customerQuery.trim();
    setCustomerActiveIndex(-1);
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

  function selectCustomer(nextCustomer: OdooCustomerRecord) {
    customerSearchRevision.current += 1;
    setCustomerSearchLoading(false);
    setCustomerSearchError(null);
    setCustomer(nextCustomer);
    setCustomers([]);
    setCustomerActiveIndex(-1);
    setCustomerQuery("");
  }

  function handleCustomerSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!customers.length) {
      if (event.key === "Escape") {
        customerSearchRevision.current += 1;
        setCustomers([]);
        setCustomerActiveIndex(-1);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCustomerActiveIndex((current) => (current + 1) % customers.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCustomerActiveIndex((current) => (current <= 0 ? customers.length - 1 : current - 1));
    } else if (event.key === "Enter" && customerActiveIndex >= 0) {
      event.preventDefault();
      const nextCustomer = customers[customerActiveIndex];
      if (nextCustomer) selectCustomer(nextCustomer);
    } else if (event.key === "Escape") {
      event.preventDefault();
      customerSearchRevision.current += 1;
      setCustomers([]);
      setCustomerActiveIndex(-1);
    }
  }

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
  const fallbackSubtotal = useMemo(
    () => Math.round(lines.reduce((sum, line) => sum + provisionalLineUnit(line.product, line.packFactor || 1) * line.quantity, 0) * 100) / 100,
    [lines],
  );
  const subtotal = quoteIsCurrent ? quote!.subtotal : fallbackSubtotal;
  const taxTotal = quoteIsCurrent ? quote!.tax : 0;
  const total = quoteIsCurrent ? quote!.unroundedTotal : fallbackSubtotal;
  const selectedPayment = paymentMethods.find((method) => method.id === paymentMethodId);
  const isCashMethod = (method: { type: string; is_cash_count?: boolean }) =>
    method.type === "cash" || Boolean(method.is_cash_count);
  const isCashPayment = selectedPayment ? isCashMethod(selectedPayment) : false;
  const amountToCollect = quoteIsCurrent ? quote!.total : 0;
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const tenderedAmount = isCashPayment && cashTendered.trim() ? Number(cashTendered) : amountToCollect;
  const changeDue = isCashPayment && Number.isFinite(tenderedAmount) ? Math.max(0, Math.round((tenderedAmount - amountToCollect) * 100) / 100) : 0;

  useEffect(() => {
    if (!exactCashArmed || !isCashPayment || !quoteIsCurrent || !lines.length) return;
    setCashTendered(amountToCollect.toFixed(2));
  }, [amountToCollect, exactCashArmed, isCashPayment, lines.length, quoteIsCurrent]);

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

  function formatStoreDate(value: string, timezone: string) {
    return formatOdooDateTime(value, timezone);
  }

  async function loadMoreProducts() {
    if (!connected || !productsHasNext || productsLoading || productsLoadingMore) return;
    const revision = searchRevision.current;
    setProductsLoadingMore(true);
    setProductsError(null);
    try {
      const result = await searchOdooRecords<OdooProductRecord>("products", {
        query,
        limit: PRODUCT_PAGE_SIZE,
        offset: products.length,
        categoryId: categoryId ?? undefined,
        stockOnly: hideOutOfStock || undefined,
      });
      if (revision !== searchRevision.current) return;
      setProducts((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...result.items.filter((item) => !seen.has(item.id))];
      });
      setProductsHasNext(Boolean(result.hasNext));
    } catch (cause) {
      if (revision === searchRevision.current) {
        setProductsError(cause instanceof Error ? cause.message : "Product search failed.");
      }
    } finally {
      if (revision === searchRevision.current) setProductsLoadingMore(false);
    }
  }

  function addProduct(product: OdooProductRecord, packFactor = 1) {
    const requested = lines.filter((line) => line.product.id === product.id).reduce((sum, line) => sum + line.quantity * (line.packFactor || 1), 0) + packFactor;
    if (requested > product.free_qty + 1e-9) {
      setError(`Only ${product.free_qty} units of ${friendlyProductName(product.display_name || product.name)} are available.`);
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
      setError(`Only ${product.free_qty} units of ${friendlyProductName(product.display_name || product.name)} are available.`);
      return;
    }
    setError(null);
    setLines((current) => current.map((line) =>
      line.product.id === productId && (line.packFactor || 1) === currentFactor
        ? { ...line, packFactor: nextFactor }
        : line));
  }

  async function handleProductSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && products.length) {
      event.preventDefault();
      setProductActiveIndex((current) => (current + 1) % products.length);
      return;
    }
    if (event.key === "ArrowUp" && products.length) {
      event.preventDefault();
      setProductActiveIndex((current) => (current <= 0 ? products.length - 1 : current - 1));
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setProductActiveIndex(-1);
      if (query) setQuery("");
      return;
    }
    if (event.key === "Enter" && productActiveIndex >= 0) {
      const product = products[productActiveIndex];
      if (!product) return;
      event.preventDefault();
      if (selectedConfig?.session && product.free_qty > 0) {
        addProduct(product);
        setQuery("");
        setProductActiveIndex(-1);
      }
      return;
    }
    if (event.key !== "Enter" || barcodeLookupBusy.current || !query.trim()) return;
    event.preventDefault();
    barcodeLookupBusy.current = true;
    setError(null);
    try {
      // Barcode scanners usually send Enter after the final character. Search
      // immediately instead of relying on the debounced text search response.
      const result = await searchOdooRecords<OdooProductRecord>("products", { query: query.trim(), limit: PRODUCT_PAGE_SIZE });
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
      setError(`Only ${product.free_qty} units of ${friendlyProductName(product.display_name || product.name)} are available.`);
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
      timezone: selectedConfig.timezone,
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
    setSelectedLineKey(null);
    setWorkspaceTab("parked");
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
      selectedPaymentMethodIdRef.current = sale.paymentMethodId;
      setPaymentMethodId(sale.paymentMethodId);
    }
    setWorkspaceTab("keys");
    setCatalogHome(true);
    setSelectedLineKey(null);
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

  function formatParkedDate(value: string, timezone?: string) {
    return formatStoreDate(value, timezone || selectedConfig?.timezone || "Australia/Adelaide");
  }

  async function checkout() {
    if (!isOnline || !selectedConfig || (!pendingCheckout && (!selectedConfig.session || !paymentMethodId || !lines.length)) || checkoutBusy.current) return;
    checkoutBusy.current = true;
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
      const request: OdooCheckoutRequest = pendingCheckout ?? {
        externalPaymentConfirmed: !isCashPayment && confirmedPaymentKey === paymentConfirmationKey,
        configId: selectedConfig.id,
        paymentMethodId: paymentMethodId!,
        orderUuid: stableOrderUuid,
        customerId: customer?.id ?? null,
        tendered: tenderedAmount,
        lines: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity, uomFactor: line.packFactor || 1 })),
      };
      if (!pendingCheckout) {
        // Persist the identity before sending money-related writes, including a browser refresh mid-request.
        if (!hydratedDraftKey) throw new Error("Wait for this terminal's draft to load before finalising.");
        try {
          const saved = JSON.parse(localStorage.getItem(hydratedDraftKey) ?? "null");
          if (!saved) throw new Error("missing draft");
          localStorage.setItem(hydratedDraftKey, JSON.stringify({ ...saved, pendingOrder: request }));
        } catch { throw new Error("This terminal cannot preserve the order identity. Enable browser storage before taking payment."); }
        setPendingCheckout(request);
      }
      const result = pendingCheckout ? await recoverOdooPosOrder(request) : await submitOdooPosOrder(request);
      if (!result) throw new OdooCheckoutPendingError(pendingCheckout!);
      setPendingCheckout(null);
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
        session: selectedConfig.session?.name ?? result.session,
        date: result.date,
        timezone: selectedConfig.timezone,
      });
      setLines([]);
      setCustomer(null);
      setCustomerQuery("");
      setCashTendered("");
      orderUuid.current = null;
      checkoutFingerprint.current = null;
    } catch (cause) {
      if (cause instanceof OdooCheckoutPendingError) setPendingCheckout(cause.order);
      else setPendingCheckout(null);
      setError(cause instanceof Error ? cause.message : "Odoo could not confirm the sale. Keep this order open and retry only after checking sales history.");
    } finally {
      checkoutBusy.current = false;
      setBusy(false);
    }
  }

  if (pendingCheckout) return <main className="flex h-full flex-col items-start gap-4 overflow-y-auto p-6">
    <h1 className="text-xl font-semibold">Payment result pending confirmation</h1>
    <p role="alert">{error || "Do not take payment again. This cart is preserved while the result is checked."}</p>
    <p className="break-all text-sm">Order reference: {pendingCheckout.orderUuid}</p>
    <button type="button" disabled={busy || !isOnline} onClick={() => void checkout()} className="min-h-11 rounded bg-green-800 px-4 text-white disabled:opacity-50">{busy ? "Checking…" : "Check saved order"}</button>
    <Link href="/history/odoo" target="_blank" className="min-h-11 underline">Open sales history in another tab</Link>
    <p className="text-sm">If the result remains unknown, a store administrator must reconcile the order and payment in Odoo before another sale is attempted.</p>
  </main>;

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
  if (connected === null) return (
    <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
      <section role="alert" className="max-w-lg rounded-xl border border-rose-200 bg-white p-7 text-center shadow-[var(--oh-shadow-card)]">
        <CircleAlert className="mx-auto text-rose-700" size={30} />
        <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Could not load the Odoo register</h1>
        <p className="mt-2 text-sm leading-6 text-rose-800">{error ?? "The register details could not be read."}</p>
        <button type="button" onClick={() => void loadPos(true)} className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]"><RefreshCw size={16} /> Retry</button>
      </section>
    </main>
  );
  if (connected === false) return (
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
  const paymentConfirmationKey = JSON.stringify([configId, paymentMethodId, amountToCollect, customer?.id, lines.map((line) => [line.product.id, line.quantity, line.packFactor])]);
  const cardPaymentConfirmed = isCashPayment || confirmedPaymentKey === paymentConfirmationKey;
  const cashEnough = Number.isFinite(tenderedAmount) && tenderedAmount + 0.001 >= amountToCollect;
  const canFinalise = Boolean(isOnline && lines.length && quoteIsCurrent && !quoteLoading && selectedConfig?.session && paymentMethodId && !busy && cardPaymentConfirmed && cashEnough);
  const finaliseLabel = busy
    ? "Processing…"
    : !isOnline
      ? "Reconnect to finalise"
      : !selectedConfig?.session
        ? "No session"
        : !lines.length
          ? "Finalise"
          : quoteLoading
            ? "Calculating…"
            : quoteError || !quoteIsCurrent
              ? "Waiting for tax…"
              : !paymentMethodId
                ? "Select payment"
                : !isCashPayment && !cardPaymentConfirmed
                  ? "Confirm card payment"
                  : isCashPayment && !cashEnough
                    ? "Enter cash received"
                    : "Finalise";
  const sessionOpen = Boolean(selectedConfig?.session);
  const sessionHint = selectedConfig?.session?.name
    ? selectedConfig.session.name
    : "No open session";

  function selectRegister(id: number) {
    selectedConfigIdRef.current = id;
    setConfigId(id);
    setCashTendered("");
    setCustomer(null);
    setCustomerQuery("");
    setCategoryId(null);
    setError(null);
    setDraftNotice(null);
    const config = bootstrap?.configs.find((item) => item.id === id);
    const nextPaymentMethodId = config?.paymentMethods[0]?.id ?? null;
    selectedPaymentMethodIdRef.current = nextPaymentMethodId;
    setPaymentMethodId(nextPaymentMethodId);
    setWorkspaceTab("keys");
    setCatalogHome(true);
    setSelectedLineKey(null);
    setPendingRegisterId(null);
    if (odooUserId) {
      try { localStorage.setItem(`${REGISTER_SELECTION_KEY}:${odooUserId}`, String(id)); } catch { /* Keep the current selection for this session. */ }
    }
  }

  function lineKey(productId: number, packFactor: number) {
    return `${productId}:${packFactor}`;
  }

  function targetCartLine() {
    if (selectedLineKey) {
      const match = lines.find((line) => lineKey(line.product.id, line.packFactor || 1) === selectedLineKey);
      if (match) return match;
    }
    return lines[lines.length - 1] ?? null;
  }

  function selectCashPayment(exact = false) {
    const method = paymentMethods.find((item) => isCashMethod(item));
    if (!method) {
      setError("No cash payment method is configured for this register.");
      return;
    }
    selectedPaymentMethodIdRef.current = method.id;
    setPaymentMethodId(method.id);
    setExactCashArmed(exact);
    setConfirmedPaymentKey(null);
    if (exact && quoteIsCurrent) setCashTendered(amountToCollect.toFixed(2));
    else if (!exact) setCashTendered("");
  }

  function selectCardPayment() {
    const nonCash = paymentMethods.filter((item) => !isCashMethod(item));
    const method = nonCash.find((item) => /card|eftpos|bank|terminal/i.test(item.name))
      ?? nonCash.find((item) => !/account|customer|credit|pay.?later/i.test(item.name))
      ?? nonCash[0]
      ?? null;
    if (!method) {
      setError("No card payment method is configured for this register.");
      return;
    }
    selectedPaymentMethodIdRef.current = method.id;
    setPaymentMethodId(method.id);
    setExactCashArmed(false);
    setCashTendered("");
  }

  function applyCaseQuantity() {
    const line = targetCartLine();
    if (!line) {
      setError("Add a product first, then use Case Quantity on the selected line.");
      return;
    }
    const current = line.packFactor || 1;
    const idx = CASE_PACK_OPTIONS.findIndex((size) => size === current);
    const next = CASE_PACK_OPTIONS[idx >= 0 ? (idx + 1) % CASE_PACK_OPTIONS.length : 1] ?? 12;
    setLinePackFactor(line.product.id, current, next);
    setSelectedLineKey(lineKey(line.product.id, next));
    setError(null);
  }

  function clearSale() {
    setLines([]);
    setCustomer(null);
    setCustomerQuery("");
    setCustomers([]);
    setCashTendered("");
    setConfirmedPaymentKey(null);
    setSelectedLineKey(null);
    setExactCashArmed(false);
    setClearSaleConfirm(false);
    setError(null);
    setDraftNotice(null);
  }

  function requestClearSale() {
    if (!lines.length) return;
    setClearSaleConfirm(true);
  }

  function openCategory(nextCategoryId: number | null) {
    setCategoryId(nextCategoryId);
    setCatalogHome(false);
    setWorkspaceTab("keys");
    setQuery("");
    setProductActiveIndex(-1);
  }

  function backToCatalogHome() {
    setCatalogHome(true);
    setCategoryId(null);
    setQuery("");
    setProductActiveIndex(-1);
  }

  const topCategories = posCategories.filter((category) => !category.parent_id);
  const SALE_KEY_ORDER = ["beer", "wine", "wines", "spirits", "soft drinks", "grocery", "products"];
  const unsortedTiles = topCategories.length > 0 ? topCategories : posCategories;
  const categoryTiles = [...unsortedTiles].sort((a, b) => {
    const aName = friendlyProductName(a.name).toLowerCase();
    const bName = friendlyProductName(b.name).toLowerCase();
    const aRank = SALE_KEY_ORDER.findIndex((key) => aName === key || aName.includes(key));
    const bRank = SALE_KEY_ORDER.findIndex((key) => bName === key || bName.includes(key));
    const aScore = aRank >= 0 ? aRank : SALE_KEY_ORDER.length;
    const bScore = bRank >= 0 ? bRank : SALE_KEY_ORDER.length;
    if (aScore !== bScore) return aScore - bScore;
    return aName.localeCompare(bName);
  });
  const showCatalogHome = catalogHome && !query.trim();
  const saleKeyTileClass =
    "flex min-h-[4.5rem] cursor-pointer flex-col items-center justify-center rounded-[var(--oh-radius)] border px-2 py-3 text-center text-[14px] font-semibold shadow-[var(--oh-shadow-card)] transition-all hover:opacity-95 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-orange)]";
  const productCount = lines.length;
  const cashMethod = paymentMethods.find((item) => isCashMethod(item)) ?? null;
  const nonCashMethods = paymentMethods.filter((item) => !isCashMethod(item));
  const cardMethod = nonCashMethods.find((item) => /card|eftpos|bank|terminal/i.test(item.name))
    ?? nonCashMethods.find((item) => !/account|customer|credit|pay.?later/i.test(item.name))
    ?? nonCashMethods[0]
    ?? null;
  const eftposSelected = Boolean(lines.length && cardMethod && paymentMethodId === cardMethod.id);
  const cashSelected = Boolean(lines.length && cashMethod && paymentMethodId === cashMethod.id);

  return (
    <main className="flex h-[calc(100dvh-50px)] min-h-0 flex-col overflow-hidden bg-[var(--oh-surface)] p-4 font-sans md:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--oh-text)]">Sell</h1>
          <p className="mt-0.5 text-[13px] text-[var(--oh-muted)]">
            Process sales, manage the cart, and finalise payments
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--oh-border)] bg-white py-1 pl-3 pr-1 shadow-sm"
            title={selectedConfig?.session ? `${selectedConfig.name} · ${selectedConfig.session.name}` : selectedConfig?.name}
          >
            <span className={cn("h-2 w-2 shrink-0 rounded-full", sessionOpen ? "bg-[var(--oh-success)]" : "bg-amber-500")} aria-hidden="true" />
            <select
              ref={registerSelectRef}
              aria-label="Register"
              value={configId ?? ""}
              disabled={busy || refreshing}
              onChange={(event) => {
                const id = Number(event.target.value);
                if (id === configId) return;
                if (lines.length) setPendingRegisterId(id);
                else selectRegister(id);
              }}
              className="max-w-[160px] truncate border-0 bg-transparent py-1 text-sm font-semibold text-[var(--oh-text)] outline-none"
            >
              {bootstrap?.configs.map((config) => (
                <option key={config.id} value={config.id}>{config.name}{config.session ? "" : " · Closed"}</option>
              ))}
            </select>
            <button type="button" onClick={() => void loadPos()} disabled={refreshing} title="Refresh register data" aria-label="Refresh register data" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] disabled:opacity-60">
              {refreshing ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            </button>
            <button type="button" onClick={() => openSalesHistory()} title="Sales History" aria-label="Sales History" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]">
              <History size={17} />
            </button>
            <button type="button" onClick={() => setHelpOpen(true)} title="POS help and recovery" aria-label="POS help and recovery" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]">
              <CircleHelp size={17} />
            </button>
            <button type="button" onClick={requestCloseRegister} title="Close register" aria-label="Close register" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]">
              <DoorClosed size={17} />
            </button>
          </div>
          {lines.length > 0 && (
            <span className="rounded-[var(--oh-radius)] border border-[var(--oh-orange-muted)] bg-[var(--oh-orange-light)] px-3 py-1.5 text-[13px] font-semibold text-[var(--oh-orange)]">
              {quantity} items · ${totalWhole}.{totalCents}
            </span>
          )}
        </div>
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

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]">
        <section className="relative order-2 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] lg:order-none lg:col-start-2 lg:row-start-2">
          <div className="flex shrink-0 items-center gap-1 border-b border-[var(--oh-border)] px-3 py-2">
            <button
              type="button"
              onClick={() => setWorkspaceTab("keys")}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-orange)]",
                workspaceTab === "keys" ? "bg-[var(--oh-orange-light)] text-[var(--oh-orange)]" : "text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]",
              )}
            >
              <KeyboardIcon size={15} strokeWidth={1.75} />
              Quick Keys
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceTab("parked")}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-orange)]",
                workspaceTab === "parked" ? "bg-[var(--oh-orange-light)] text-[var(--oh-orange)]" : "text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]",
              )}
            >
              <ParkingIcon size={15} strokeWidth={1.75} />
              Parked Sales
              {visibleParkedSales.length > 0 && (
                <span className="ml-0.5 rounded-full bg-[var(--oh-primary)] px-1.5 py-0.5 text-[13px] font-semibold leading-none text-white">
                  {visibleParkedSales.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceTab("more")}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-orange)]",
                workspaceTab === "more" ? "bg-[var(--oh-orange-light)] text-[var(--oh-orange)]" : "text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]",
              )}
            >
              More Actions
            </button>
          </div>

          <div className="relative min-h-0 flex-1 overflow-y-auto p-4">
            {workspaceTab === "parked" ? (
              <div className="space-y-3">
                <p className="flex items-start gap-2 rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3 text-xs leading-5 text-[var(--oh-text-secondary)]">
                  <Clock3 size={15} className="mt-0.5 shrink-0" />
                  Parked sales are saved on this terminal.
                </p>
                {visibleParkedSales.length ? (
                  <div className="grid gap-2">
                    {visibleParkedSales.map((sale) => (
                      <article key={sale.id} className="rounded-xl border border-[var(--oh-border)] bg-white p-3 shadow-sm">
                        <h3 className="truncate text-sm font-semibold text-[var(--oh-text)]">{sale.customer?.name ?? "Walk-in customer"}</h3>
                        <p className="mt-1 text-xs text-[var(--oh-text-secondary)]">{formatParkedDate(sale.createdAt, sale.timezone)} · {sale.registerName}</p>
                        <p className="mt-1 text-xs text-[var(--oh-text-secondary)]">
                          {sale.lines.reduce((sum, line) => sum + line.quantity, 0)} items · {money(sale.lines.reduce((sum, line) => sum + provisionalLineUnit(line.product, line.packFactor || 1) * line.quantity, 0))}
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button type="button" onClick={() => requestResumeParkedSale(sale)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[var(--sf-cta)] px-3 text-sm font-semibold text-white hover:bg-[var(--sf-cta-hover)]"><RotateCcw size={15} /> Resume</button>
                          <button type="button" onClick={() => setParkedAction({ type: "discard", saleId: sale.id })} className="h-11 rounded-md border border-[var(--oh-border)] px-3 text-sm font-medium text-[var(--oh-text-secondary)] hover:text-red-700">Discard</button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="grid place-items-center py-16 text-center">
                    <Archive size={24} className="mx-auto text-[var(--oh-border-strong)]" />
                    <p className="mt-2 text-sm font-medium text-[var(--oh-text)]">No parked sales</p>
                    <p className="mt-1 text-[13px] text-[var(--oh-muted)]">Park the current cart to resume it later from this list</p>
                  </div>
                )}
              </div>
            ) : workspaceTab === "more" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">Register actions</p>
                  <button type="button" onClick={() => setWorkspaceTab("keys")} className="cursor-pointer text-[13px] font-medium text-[var(--oh-orange)] hover:underline">
                    ← Back to Quick Keys
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <button type="button" onClick={() => { setWorkspaceTab("keys"); openCategory(null); }} className="flex aspect-square max-h-[120px] flex-col items-center justify-center rounded-[var(--oh-radius)] border border-[var(--oh-tile-blue-border)] bg-[var(--oh-tile-blue-bg)] p-2 text-[13px] font-semibold text-[var(--oh-tile-blue-text)] shadow-[var(--oh-shadow-card)] hover:opacity-95">
                    All products
                  </button>
                  <button type="button" onClick={() => openSalesHistory()} className="flex aspect-square max-h-[120px] flex-col items-center justify-center rounded-[var(--oh-radius)] border border-[var(--oh-tile-blue-border)] bg-[var(--oh-tile-blue-bg)] p-2 text-[13px] font-semibold text-[var(--oh-tile-blue-text)] shadow-[var(--oh-shadow-card)] hover:opacity-95">
                    Sales History
                  </button>
                  <button type="button" onClick={() => setHelpOpen(true)} className="flex aspect-square max-h-[120px] flex-col items-center justify-center rounded-[var(--oh-radius)] border border-[var(--oh-tile-orange-border)] bg-[var(--oh-tile-orange-bg)] p-2 text-[13px] font-semibold text-[var(--oh-tile-orange-text)] shadow-[var(--oh-shadow-card)] hover:opacity-95">
                    POS Help
                  </button>
                  <button type="button" onClick={requestCloseRegister} className="flex aspect-square max-h-[120px] flex-col items-center justify-center rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-2 text-[13px] font-semibold text-[var(--oh-text)] shadow-[var(--oh-shadow-card)] hover:border-[var(--oh-orange)]">
                    Close Register
                  </button>
                </div>
              </div>
            ) : showCatalogHome ? (
              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">Sale keys</p>
                    <span className="text-[13px] text-[var(--oh-muted)]">Home Keys</span>
                  </div>
                  {categoriesError && (
                    <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <span>{categoriesError}</span>
                      <button type="button" onClick={() => setCategoryRetryKey((value) => value + 1)} disabled={categoriesLoading} className="inline-flex min-h-11 items-center gap-1 rounded-md border border-amber-300 bg-white px-2 font-semibold">
                        {categoriesLoading ? "Retrying…" : "Retry categories"}
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    <button
                      type="button"
                      onClick={() => openCategory(null)}
                      className={saleKeyTileClass}
                      style={{ backgroundColor: "var(--oh-tile-green-bg)", borderColor: "var(--oh-tile-green-border)", color: "var(--oh-tile-green-text)" }}
                    >
                      All products
                    </button>
                    {categoryTiles.map((category, index) => {
                      const tone = CATEGORY_TILE_TONES[index % CATEGORY_TILE_TONES.length];
                      const label = friendlyProductName(category.name);
                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => openCategory(category.id)}
                          className={saleKeyTileClass}
                          style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.text }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {categoryTiles.length === 0 && !categoriesLoading && !categoriesError && (
                    <div role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-950">
                      <p className="font-medium">No POS category keys yet</p>
                      <p className="mt-1 leading-5">
                        Sale Keys come from Odoo POS categories linked on products (<code className="text-[12px]">pos_categ_ids</code>).
                        Assign categories in the product catalogue, then refresh this register.
                      </p>
                      <Link href="/products/odoo" className="mt-2 inline-flex min-h-11 items-center font-semibold text-[var(--oh-orange)] underline underline-offset-2">
                        Open product catalogue
                      </Link>
                    </div>
                  )}
                  <p className="mt-3 text-[13px] text-[var(--oh-muted)]">
                    Tap a category to browse products, or search in the cart panel.
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">Line controls</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={!lines.length} onClick={() => { const line = targetCartLine(); if (line) changeQuantity(line.product.id, line.packFactor || 1, 1); }} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2 text-[13px] font-medium text-[var(--oh-text-secondary)] hover:border-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-40">+ Qty</button>
                    <button type="button" disabled={!lines.length || (targetCartLine()?.quantity ?? 0) <= 1} onClick={() => { const line = targetCartLine(); if (line) changeQuantity(line.product.id, line.packFactor || 1, -1); }} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2 text-[13px] font-medium text-[var(--oh-text-secondary)] hover:border-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-40">− Qty</button>
                    <button type="button" disabled={!lines.length} onClick={applyCaseQuantity} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2 text-[13px] font-medium text-[var(--oh-text-secondary)] hover:border-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-40">Case Qty</button>
                    <button type="button" disabled={!lines.length || !parkedLoaded || !selectedConfig || busy} onClick={() => parkCurrentSale()} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2 text-[13px] font-medium text-[var(--oh-text-secondary)] hover:border-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-40">Park Sale</button>
                    <button type="button" disabled={!lines.length} onClick={requestClearSale} className="min-h-11 rounded-lg border border-[var(--oh-tile-red-border)] bg-[var(--oh-tile-red-bg)] px-3 py-2 text-[13px] font-medium text-[var(--oh-tile-red-text)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">Clear Sale</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={backToCatalogHome} className="min-h-11 cursor-pointer rounded-lg px-2 text-[13px] font-medium text-[var(--oh-orange)] hover:underline">
                    ← Back to Quick Keys
                  </button>
                  <span className="text-[15px] font-semibold text-[var(--oh-text)]">
                    {categoryId === null
                      ? (query.trim() ? `Search: ${query.trim()}` : "All products")
                      : friendlyProductName(posCategories.find((item) => item.id === categoryId)?.name ?? "Products")}
                  </span>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-2.5 text-xs font-semibold text-[var(--oh-text)]">
                      <input type="checkbox" className="h-4 w-4 rounded border-[var(--oh-border)]" checked={hideOutOfStock} onChange={(event) => setHideOutOfStock(event.target.checked)} />
                      Hide out of stock
                    </label>
                    <div className="inline-flex rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] p-0.5" role="group" aria-label="Catalogue density">
                      <button type="button" aria-pressed={catalogDensity === "grid"} aria-label="Grid view" onClick={() => setCatalogDensity("grid")} className={cn("grid h-10 w-10 place-items-center rounded", catalogDensity === "grid" ? "bg-white text-[var(--oh-primary)] shadow-sm" : "text-[var(--oh-text-secondary)]")}>
                        <LayoutGrid size={16} />
                      </button>
                      <button type="button" aria-pressed={catalogDensity === "list"} aria-label="List view" onClick={() => setCatalogDensity("list")} className={cn("grid h-10 w-10 place-items-center rounded", catalogDensity === "list" ? "bg-white text-[var(--oh-primary)] shadow-sm" : "text-[var(--oh-text-secondary)]")}>
                        <List size={16} />
                      </button>
                    </div>
                  </div>
                </div>
                <div id="pos-product-results" className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-[var(--sf-pad-bg)] p-3">
                  {productsLoading && !products.length ? (
                    <div aria-label="Loading products" className={cn(catalogDensity === "list" ? "grid gap-2" : "grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4")}>
                      {Array.from({ length: 8 }, (_, index) => <div key={index} className={cn("animate-pulse rounded-lg border border-[var(--oh-border)] bg-white", catalogDensity === "list" ? "h-16" : "min-h-36")} />)}
                    </div>
                  ) : productsError && !products.length ? (
                    <div role="alert" className="grid min-h-48 place-items-center px-5 text-center">
                      <div className="max-w-sm">
                        <CircleAlert size={26} className="mx-auto text-red-700" />
                        <p className="mt-2 font-semibold text-[var(--oh-text)]">Products could not load</p>
                        <p className="mt-1 text-sm text-[var(--oh-muted)]">{productsError}</p>
                        <button type="button" onClick={() => setProductRetryKey((value) => value + 1)} disabled={productsLoading} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-4 text-sm font-semibold">
                          {productsLoading ? "Retrying…" : "Retry search"}
                        </button>
                      </div>
                    </div>
                  ) : products.length ? (
                    <div className="flex min-h-full flex-col">
                      <div role="listbox" aria-label="POS product search results" className={cn(catalogDensity === "list" ? "grid gap-2" : "grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4")}>
                        {products.map((product, index) => {
                          const fullName = product.display_name || product.name;
                          const label = friendlyProductName(fullName);
                          const shelfPrice = shelfUnitPrice(product);
                          const inStock = product.free_qty > 0;
                          const disabled = !selectedConfig?.session || !inStock;
                          const selected = index === productActiveIndex;
                          if (catalogDensity === "list") {
                            return (
                              <button key={product.id} id={`pos-product-option-${product.id}`} type="button" role="option" aria-selected={selected} title={fullName} onClick={() => addProduct(product)} disabled={disabled} className={cn("flex min-h-14 items-center gap-3 rounded-xl border border-[var(--oh-border)] bg-white px-3 py-2 text-left shadow-sm transition-colors hover:border-[var(--oh-primary)]/45 hover:bg-[var(--oh-orange-light)] disabled:cursor-not-allowed disabled:opacity-45", selected && "border-[var(--oh-primary)] bg-[var(--oh-orange-light)]")}>
                                <ProductImage productId={product.id} name={label} className="h-12 w-12 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-orange-light)]" fallbackClassName="text-lg" />
                                <span className="min-w-0 flex-1">
                                  <span className="oh-type-body block truncate font-semibold text-[var(--oh-text)]">{label}</span>
                                  <span className={cn("oh-type-label", inStock ? "text-[var(--oh-text-secondary)]" : "font-medium text-amber-800")}>{inStock ? `${formatStockQty(product.free_qty)} avail.` : "No stock"}</span>
                                </span>
                                <span className="shrink-0 text-right">
                                  {shelfPrice === null ? <span className="oh-type-label font-semibold text-amber-800">Price unavailable</span> : <span className="text-base font-bold tabular-nums text-[var(--oh-text)]">{money(shelfPrice)}</span>}
                                </span>
                              </button>
                            );
                          }
                          return (
                            <button key={product.id} id={`pos-product-option-${product.id}`} type="button" role="option" aria-selected={selected} title={fullName} onClick={() => addProduct(product)} disabled={disabled} className={cn("flex min-h-[132px] flex-col rounded-xl border border-[var(--oh-border)] bg-white p-3 text-left shadow-sm transition-colors hover:border-[var(--oh-primary)]/45 hover:bg-[var(--oh-orange-light)] disabled:cursor-not-allowed disabled:opacity-45", selected && "border-[var(--oh-primary)] bg-[var(--oh-orange-light)]")}>
                              <ProductImage productId={product.id} name={label} className="mb-2 h-16 w-16 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-orange-light)]" fallbackClassName="text-2xl" />
                              <span className="oh-type-body line-clamp-2 font-semibold leading-5 text-[var(--oh-text)]">{label}</span>
                              {shelfPrice === null ? <span className="oh-type-label mt-auto pt-2 font-semibold text-amber-800">Price unavailable</span> : <span className="mt-auto pt-2 text-base font-bold tabular-nums leading-none text-[var(--oh-text)]">{money(shelfPrice)}</span>}
                              {!inStock ? <span className="oh-type-label mt-0.5 font-medium text-amber-800">No stock</span> : product.free_qty <= 3 ? <span className="oh-type-label mt-0.5 font-medium text-amber-800">{formatStockQty(product.free_qty)} left</span> : null}
                            </button>
                          );
                        })}
                      </div>
                      {productsHasNext && (
                        <div className="mt-3 flex justify-center">
                          <button type="button" onClick={() => void loadMoreProducts()} disabled={productsLoadingMore || productsLoading} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-4 text-sm font-semibold disabled:cursor-wait disabled:opacity-60">
                            {productsLoadingMore ? <LoaderCircle size={15} className="animate-spin" /> : null}
                            {productsLoadingMore ? "Loading…" : "Load more products"}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid h-full place-items-center px-5 text-center text-sm text-[var(--oh-text-secondary)]">
                      <div>
                        <Search size={28} className="mx-auto mb-2 text-[var(--oh-border-strong)]" />
                        <p className="font-medium text-[var(--oh-text)]">No products here</p>
                        <p className="mt-1">{hideOutOfStock ? "No in-stock products match. Clear filters or show out-of-stock items." : "Search or scan a barcode to find stock."}</p>
                        <button type="button" onClick={backToCatalogHome} className="mt-3 font-semibold text-[var(--sf-tab-blue)] underline underline-offset-2">Back to Quick Keys</button>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">Line controls</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={!lines.length} onClick={() => { const line = targetCartLine(); if (line) changeQuantity(line.product.id, line.packFactor || 1, 1); }} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2 text-[13px] font-medium text-[var(--oh-text-secondary)] hover:border-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-40">+ Qty</button>
                    <button type="button" disabled={!lines.length || (targetCartLine()?.quantity ?? 0) <= 1} onClick={() => { const line = targetCartLine(); if (line) changeQuantity(line.product.id, line.packFactor || 1, -1); }} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2 text-[13px] font-medium text-[var(--oh-text-secondary)] hover:border-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-40">− Qty</button>
                    <button type="button" disabled={!lines.length} onClick={applyCaseQuantity} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2 text-[13px] font-medium text-[var(--oh-text-secondary)] hover:border-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-40">Case Qty</button>
                    <button type="button" disabled={!lines.length || !parkedLoaded || !selectedConfig || busy} onClick={() => parkCurrentSale()} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2 text-[13px] font-medium text-[var(--oh-text-secondary)] hover:border-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-40">Park Sale</button>
                    <button type="button" disabled={!lines.length} onClick={requestClearSale} className="min-h-11 rounded-lg border border-[var(--oh-tile-red-border)] bg-[var(--oh-tile-red-bg)] px-3 py-2 text-[13px] font-medium text-[var(--oh-tile-red-text)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">Clear Sale</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="order-1 shrink-0 lg:order-none lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <div className="flex flex-wrap items-center gap-2">
            {eftposSelected ? (
              <AdminNavyButton
                className="min-h-11 ring-2 ring-[var(--oh-primary)] ring-offset-1"
                onClick={() => selectCardPayment()}
                disabled={!lines.length || !cardMethod}
              >
                EFTPOS
              </AdminNavyButton>
            ) : (
              <AdminSecondaryButton
                className="min-h-11"
                onClick={() => selectCardPayment()}
                disabled={!lines.length || !cardMethod}
                title={!lines.length ? "Add items before choosing EFTPOS" : !cardMethod ? "No card payment method on this register" : cardMethod.name}
              >
                EFTPOS
              </AdminSecondaryButton>
            )}
            {cashSelected ? (
              <AdminNavyButton
                className="min-h-11 ring-2 ring-[var(--oh-primary)] ring-offset-1"
                onClick={() => selectCashPayment(true)}
                disabled={!lines.length || !cashMethod}
              >
                Exact Cash
              </AdminNavyButton>
            ) : (
              <AdminSecondaryButton
                className="min-h-11"
                onClick={() => selectCashPayment(true)}
                disabled={!lines.length || !cashMethod}
                title={!lines.length ? "Add items before choosing Exact Cash" : !cashMethod ? "No cash payment method on this register" : "Select cash and fill the exact amount due"}
              >
                Exact Cash
              </AdminSecondaryButton>
            )}
            <AdminSecondaryButton
              className="min-h-11"
              onClick={applyCaseQuantity}
              disabled={!lines.length}
              title={lines.length ? "Cycle pack size on the selected line (Each → 6 → 12 → 24)" : "Add a product first"}
            >
              Case Quantity
            </AdminSecondaryButton>
            <AdminSecondaryButton
              className="min-h-11"
              onClick={() => parkCurrentSale()}
              disabled={!lines.length || !parkedLoaded || !selectedConfig || busy}
              title={!lines.length ? "Nothing to park" : "Save this cart on this terminal"}
            >
              Park Sale
            </AdminSecondaryButton>
            <AdminSecondaryButton
              className={cn("min-h-11", lines.length > 0 && "border-[var(--oh-tile-red-border)] text-[var(--oh-tile-red-text)] hover:bg-[var(--oh-tile-red-bg)]")}
              onClick={requestClearSale}
              disabled={!lines.length}
              title={lines.length ? "Clear the current cart" : "Cart is already empty"}
            >
              Clear Sale
            </AdminSecondaryButton>
            <div className="ml-auto flex flex-wrap items-center gap-3 rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-3 py-1.5 shadow-sm">
              <span className={cn("text-[22px] font-bold leading-none tabular-nums", lines.length ? "text-[var(--oh-text)]" : "text-[var(--oh-border-strong)]")}>
                ${totalWhole}
                <span className="text-[14px]">.{totalCents}</span>
              </span>
              <button
                type="button"
                disabled={!canFinalise}
                onClick={() => void checkout()}
                title={!canFinalise ? finaliseLabel : "Complete this sale in Odoo"}
                className={cn(
                  "min-h-11 cursor-pointer rounded-[var(--oh-radius)] px-5 text-[14px] font-semibold text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-orange)]",
                  canFinalise ? "bg-[var(--oh-primary)] hover:bg-[var(--oh-primary-hover)]" : "cursor-not-allowed bg-[var(--oh-border-strong)]",
                )}
              >
                {finaliseLabel === "Finalise" ? "Finalise Sale" : finaliseLabel}
              </button>
            </div>
          </div>
          {(isCashPayment || (!isCashPayment && paymentMethodId)) && lines.length > 0 && (
            <div className="mt-2 flex flex-wrap items-end gap-3 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2">
              {isCashPayment && (
                <label className="grid min-w-[160px] flex-1 gap-1 text-[13px] font-medium text-[var(--oh-text-secondary)]">
                  Cash received
                  <input
                    type="number"
                    inputMode="decimal"
                    min={amountToCollect}
                    max={1_000_000}
                    step="0.01"
                    value={cashTendered}
                    onChange={(event) => {
                      setExactCashArmed(false);
                      setCashTendered(event.target.value);
                    }}
                    placeholder={amountToCollect.toFixed(2)}
                    className="h-11 rounded-md border border-[var(--oh-border)] bg-white px-2 text-sm font-semibold tabular-nums outline-none focus:border-[var(--oh-primary)]"
                  />
                  {Number.isFinite(tenderedAmount) && tenderedAmount + 0.001 >= amountToCollect && (
                    <span className="text-[13px] text-[var(--oh-muted)]">Change {money(changeDue)}</span>
                  )}
                </label>
              )}
              {!isCashPayment && paymentMethodId && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={confirmedPaymentKey === paymentConfirmationKey}
                  disabled={busy || !quoteIsCurrent}
                  onClick={() => setConfirmedPaymentKey((current) => (current === paymentConfirmationKey ? null : paymentConfirmationKey))}
                  className={cn(
                    "flex min-h-14 min-w-[240px] flex-1 items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    confirmedPaymentKey === paymentConfirmationKey
                      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                      : "border-[var(--oh-border)] bg-[var(--oh-surface)] text-[var(--oh-text)] hover:bg-white",
                  )}
                >
                  <span aria-hidden="true" className={cn("mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full px-0.5 transition-colors", confirmedPaymentKey === paymentConfirmationKey ? "bg-emerald-600" : "bg-slate-300")}>
                    <span className={cn("h-6 w-6 rounded-full bg-white shadow transition-transform", confirmedPaymentKey === paymentConfirmationKey && "translate-x-5")} />
                  </span>
                  <span>
                    <span className="block font-semibold">Payment approved on terminal</span>
                    <span className="mt-0.5 block text-xs leading-5 opacity-90">Records the payment only — Orithos does not charge the card.</span>
                  </span>
                </button>
              )}
              {selectedPayment && (
                <p className="text-[13px] text-[var(--oh-muted)]">Paying with {selectedPayment.name}</p>
              )}
            </div>
          )}
        </div>

        <aside className="order-3 flex w-full shrink-0 flex-col overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] lg:order-none lg:col-start-1 lg:row-start-2 lg:w-auto">
          <div className="border-b border-[var(--oh-border)] px-4 py-3">
            {customer ? (
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--oh-navy)] text-[13px] font-bold text-white">
                  {customer.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[var(--oh-text)]">{customer.name}</p>
                  <p className="text-[13px] text-[var(--oh-muted)]">Odoo customer</p>
                </div>
                <button type="button" aria-label="Remove customer" onClick={() => setCustomer(null)} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-tile-red-bg)] hover:text-[var(--oh-danger)]">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <label className="flex min-h-11 w-full cursor-text items-center gap-2 rounded-lg border border-dashed border-[var(--oh-border)] px-3 py-2.5">
                <PlusIcon size={15} strokeWidth={1.75} className="text-[var(--oh-text-secondary)]" />
                <input
                  value={customerQuery}
                  aria-label="Search customers"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-controls="customer-search-results"
                  aria-expanded={customers.length > 0}
                  aria-activedescendant={customerActiveIndex >= 0 ? `customer-option-${customers[customerActiveIndex]?.id}` : undefined}
                  onChange={(event) => { setCustomers([]); setCustomerQuery(event.target.value); }}
                  onKeyDown={handleCustomerSearchKeyDown}
                  placeholder="Add customer"
                  className="h-full min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-text-secondary)]"
                />
              </label>
            )}
            {!customer && customerSearchLoading && <p role="status" className="mt-2 text-xs text-[var(--oh-muted)]">Searching customers…</p>}
            {!customer && customerSearchError && (
              <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-red-900">
                <span>{customerSearchError}</span>
                <button type="button" onClick={() => setCustomerSearchKey((value) => value + 1)} className="font-semibold underline">Retry</button>
              </div>
            )}
            {!customer && customers.length > 0 && (
              <div id="customer-search-results" role="listbox" aria-label="Customer search results" className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-[var(--oh-border)]">
                {customers.map((item, index) => (
                  <button id={`customer-option-${item.id}`} key={item.id} type="button" role="option" aria-selected={index === customerActiveIndex} onClick={() => selectCustomer(item)} className={cn("flex min-h-11 w-full items-center border-b border-[var(--oh-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--oh-orange-light)]", index === customerActiveIndex && "bg-[var(--oh-orange-light)]")}>
                    {item.name}<span className="ml-2 text-xs text-[var(--oh-text-secondary)]">{item.phone || item.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-b border-[var(--oh-border)] px-4 py-3">
            <div className="flex h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3">
              <Search size={16} className="shrink-0 text-[var(--sf-placeholder)]" />
              <input
                aria-label="Search products by name, barcode or code"
                role="combobox"
                aria-autocomplete="list"
                aria-controls="pos-product-results"
                aria-expanded={products.length > 0}
                aria-activedescendant={productActiveIndex >= 0 ? `pos-product-option-${products[productActiveIndex]?.id}` : undefined}
                value={query}
                onChange={(event) => {
                  setProductsError(null);
                  setProductActiveIndex(-1);
                  setQuery(event.target.value);
                  setCatalogHome(false);
                  setWorkspaceTab("keys");
                }}
                onKeyDown={(event) => void handleProductSearchKeyDown(event)}
                placeholder="Search or scan to add a product"
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-[var(--oh-text)] outline-none placeholder:text-[var(--sf-placeholder)]"
              />
              {productsLoading && <LoaderCircle size={14} className="animate-spin text-[var(--sf-placeholder)]" />}
            </div>
          </div>

          <div className="min-h-[120px] flex-1 overflow-y-auto">
            {!lines.length ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                <CartIcon size={28} className="text-[var(--oh-border-strong)]" />
                <p className="text-[14px] font-medium text-[var(--oh-text-secondary)]">Cart is empty</p>
                <p className="text-[13px] text-[var(--oh-muted)]">Search or tap a quick key to add items</p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--oh-border)]">
                {lines.map(({ product, quantity: qty, packFactor }) => {
                  const factor = packFactor || 1;
                  const key = lineKey(product.id, factor);
                  const quotedLine = quoteIsCurrent ? quote?.lines.find((line) => line.productId === product.id && line.uomFactor === factor) : undefined;
                  const provisionalUnit = provisionalLineUnit(product, factor);
                  const lineTotal = splitMoney(quotedLine?.total ?? provisionalUnit * qty);
                  const unitPrice = quotedLine ? quotedLine.total / qty : provisionalUnit;
                  const fullName = product.display_name || product.name;
                  const label = friendlyProductName(fullName);
                  const selected = selectedLineKey === key;
                  return (
                    <li key={key}>
                      <div
                        role="button"
                        tabIndex={-1}
                        onClick={() => setSelectedLineKey(key)}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors",
                          selected ? "bg-[var(--oh-orange-light)]/50" : "hover:bg-[var(--oh-surface)]",
                        )}
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] text-[13px] font-semibold text-[var(--oh-text-secondary)]">
                          {qty}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-[var(--oh-text)]" title={fullName}>{label}</p>
                          <p className="text-[13px] text-[var(--oh-muted)]">
                            {factor > 1 ? `${money(unitPrice)} / case · ${factor}` : `${money(unitPrice)} each`}
                          </p>
                        </div>
                        <span className="shrink-0 text-[13px] font-semibold text-[var(--oh-text)]">${lineTotal.whole}.{lineTotal.cents}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${label}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setLines((current) => current.filter((line) => !(line.product.id === product.id && (line.packFactor || 1) === factor)));
                            if (selectedLineKey === key) setSelectedLineKey(null);
                          }}
                          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-tile-red-bg)] hover:text-[var(--oh-danger)]"
                        >
                          <Trash2 size={15} strokeWidth={1.75} />
                        </button>
                      </div>
                      {selected && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--oh-border)] bg-[var(--oh-surface)]/40 px-4 py-2 pl-[4.25rem]">
                          <button type="button" aria-label={`Decrease ${label}`} onClick={() => changeQuantity(product.id, factor, -1)} className="grid h-11 w-11 place-items-center rounded-md border border-[var(--oh-border)] bg-white"><Minus size={15} /></button>
                          <button type="button" aria-label={`Increase ${label}`} onClick={() => changeQuantity(product.id, factor, 1)} className="grid h-11 w-11 place-items-center rounded-md border border-[var(--oh-border)] bg-white"><Plus size={15} /></button>
                          <label className="flex items-center gap-2 text-[13px] text-[var(--oh-text-secondary)]">
                            Pack
                            <select aria-label={`Pack size for ${label}`} value={factor} onChange={(event) => { const next = Number(event.target.value); setLinePackFactor(product.id, factor, next); setSelectedLineKey(lineKey(product.id, next)); }} className="h-11 rounded-md border border-[var(--oh-border)] bg-white px-2 text-[13px] font-semibold text-[var(--oh-text)]">
                              {CASE_PACK_OPTIONS.map((size) => <option key={size} value={size}>{size === 1 ? "Each" : `Case ×${size}`}</option>)}
                            </select>
                          </label>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-[var(--oh-border)] bg-[var(--oh-surface)]/50 p-4">
            <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] text-[var(--oh-muted)]">
              <span>{quantity} {quantity === 1 ? "item" : "items"}</span>
              <span className="text-right">{productCount} products</span>
              <span>Subtotal {money(subtotal)}</span>
              <span className="text-right">GST {quoteLoading ? "…" : money(taxTotal)}</span>
            </div>
            {quoteError && connected && isOnline && selectedConfig?.session && paymentMethodId && lines.length > 0 && (
              <div role="alert" className="mb-3 grid gap-1.5 text-left text-xs text-red-800">
                <span>{quoteError}</span>
                <button type="button" onClick={() => { setQuoteFailure(null); setQuoteRetryKey((value) => value + 1); }} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-red-300 bg-white px-3 font-semibold text-red-900 hover:bg-red-50">
                  <RefreshCw size={14} /> Retry quote
                </button>
              </div>
            )}
            {!canFinalise && lines.length > 0 && !busy && isOnline && selectedConfig?.session && finaliseLabel !== "Finalise" && (
              <p role="status" className="mb-2 text-xs font-medium text-amber-800">{finaliseLabel}</p>
            )}
            <div className="flex items-end justify-between">
              <span className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">Total</span>
              <p className="text-[32px] font-bold leading-none text-[var(--oh-text)]">
                ${totalWhole}
                <span className="text-[20px]">.{totalCents}</span>
              </p>
            </div>
          </div>
        </aside>
      </div>

            {receipt && <div role="dialog" aria-modal="true" aria-labelledby="sale-complete-title" className="receipt-overlay fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setReceipt(null); }}>
        <section className="receipt-print my-auto w-full max-w-sm rounded-xl border border-[var(--oh-border)] bg-white p-6 shadow-2xl">
          <header className="receipt-print-hidden mb-4 flex items-center justify-between gap-4 border-b border-[var(--oh-border)] pb-3"><div className="flex items-center gap-2 text-emerald-700"><Check size={20} /><h2 id="sale-complete-title" className="text-lg font-semibold text-[var(--oh-text)]">Sale complete</h2></div><button type="button" onClick={() => setReceipt(null)} aria-label="Close receipt" className="grid h-11 w-11 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><X size={18} /></button></header>
          <div className="text-center"><p className="text-sm font-bold uppercase tracking-[.15em] text-[var(--oh-text)]">{receipt.companyName}</p><p className="mt-1 text-xs text-[var(--oh-muted)]">Sales receipt</p><h3 className="mt-3 text-lg font-bold text-[var(--oh-text)]">{receipt.reference}</h3><p className="mt-1 text-xs text-[var(--oh-muted)]">{formatStoreDate(receipt.date, receipt.timezone)}</p></div>
          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 border-y border-dashed border-[var(--oh-border)] py-3 text-xs"><dt className="text-[var(--oh-muted)]">Customer</dt><dd className="text-right font-medium text-[var(--oh-text)]">{receipt.customerName}</dd><dt className="text-[var(--oh-muted)]">Register</dt><dd className="text-right text-[var(--oh-text)]">{receipt.session}</dd></dl>
          <table className="mt-4 w-full text-xs"><thead><tr className="border-b border-[var(--oh-border)] text-[var(--oh-muted)]"><th scope="col" className="pb-2 text-left font-semibold">Item</th><th scope="col" className="pb-2 text-right font-semibold">Qty</th><th scope="col" className="pb-2 text-right font-semibold">Total</th></tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{receipt.lines.map((line, index) => <tr key={`${line.name}-${index}`}><td className="py-2 pr-2 font-medium text-[var(--oh-text)]">{line.name}</td><td className="py-2 text-right tabular-nums text-[var(--oh-text-secondary)]">{line.quantity}</td><td className="py-2 text-right tabular-nums text-[var(--oh-text)]">{money(line.total)}</td></tr>)}</tbody></table>
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
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setParkedAction(null)} className="min-h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Cancel</button><button type="button" onClick={confirmParkedAction} className={`min-h-11 rounded-md px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] ${parkedAction.type === "discard" ? "bg-red-700 hover:bg-red-800" : "bg-[var(--sf-link-blue)] hover:brightness-95"}`}>{parkedAction.type === "resume" ? "Resume sale" : "Discard draft"}</button></div>
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
            <button type="button" onClick={() => setHelpOpen(false)} aria-label="Close POS help" className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><X size={18} /></button>
          </header>
          <div className="mt-5 grid gap-4 text-sm leading-6 text-[var(--oh-text-secondary)]">
            <section><h3 className="font-semibold text-[var(--oh-text)]">Payment is still processing</h3><p className="mt-1">Keep this page open and do not submit again. Check Sales History before retrying if the result is unknown.</p></section>
            <section><h3 className="font-semibold text-[var(--oh-text)]">Tax or total could not be calculated</h3><p className="mt-1">Use Retry quote with the same cart. Finalise stays locked until Odoo returns a fresh total.</p></section>
            <section><h3 className="font-semibold text-[var(--oh-text)]">Connection is offline</h3><p className="mt-1">The cart remains on this device. Reconnect, wait for the online indicator, then retry the quote before finalising.</p></section>
            <section><h3 className="font-semibold text-[var(--oh-text)]">Register is closed or products are missing</h3><p className="mt-1">Refresh after opening the matching Odoo POS session. Product availability comes from the selected register&apos;s Odoo inventory context.</p></section>
          </div>
        </section>
      </div>}
      {closeRegisterCartWarn && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCloseRegisterCartWarn(false);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="close-register-cart-title"
            aria-describedby="close-register-cart-description"
            className="w-full max-w-md rounded-xl border border-[var(--oh-border)] bg-white p-6 shadow-2xl"
          >
            <h2 id="close-register-cart-title" className="text-lg font-semibold text-[var(--oh-text)]">Cart has items</h2>
            <p id="close-register-cart-description" className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">
              Closing the register does not clear this cart. Park or finish the sale first if you need to keep it.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCloseRegisterCartWarn(false)}
                className="min-h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setCloseRegisterCartWarn(false);
                  openCloseRegister();
                }}
                className="min-h-11 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
              >
                Continue
              </button>
            </div>
          </section>
        </div>
      )}
      {clearSaleConfirm && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setClearSaleConfirm(false);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-sale-title"
            aria-describedby="clear-sale-description"
            className="w-full max-w-md rounded-xl border border-[var(--oh-border)] bg-white p-6 shadow-2xl"
          >
            <h2 id="clear-sale-title" className="text-lg font-semibold text-[var(--oh-text)]">Clear this sale?</h2>
            <p id="clear-sale-description" className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">
              This removes all lines and the selected customer from the cart. It does not change any completed Odoo sale.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setClearSaleConfirm(false)}
                className="min-h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={clearSale}
                className="min-h-11 rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
              >
                Clear sale
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
