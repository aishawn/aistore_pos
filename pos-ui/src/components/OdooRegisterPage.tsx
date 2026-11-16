"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, CircleAlert, DoorClosed, LoaderCircle, Printer, RefreshCw, X } from "lucide-react";
import { SalesMenu } from "@/components/SalesMenu";
import { useCloseRegisterUiOptional } from "@/components/CloseRegisterUiProvider";
import { useSalesHistoryUiOptional } from "@/components/SalesHistoryUiProvider";
import { ODOO_REGISTER_CLOSED_EVENT } from "@/components/OdooCloseRegisterForm";
import { OdooSellCartAside } from "@/components/odoo-sell/OdooSellCartAside";
import { OdooSellCatalogWorkspace } from "@/components/odoo-sell/OdooSellCatalogWorkspace";
import { OdooSellParkedList } from "@/components/odoo-sell/OdooSellParkedList";
import { OdooSellPaymentBar } from "@/components/odoo-sell/OdooSellPaymentBar";
import {
  CASE_PACK_OPTIONS,
  money,
  provisionalLineUnit,
  shelfUnitPrice,
  type CartLine,
  type CatalogDensity,
  type ParkedOdooSale,
  type WorkspaceTab,
} from "@/components/odoo-sell/shared";
import {
  getOdooPosBootstrap,
  openOdooPosSession,
  getOdooSession,
  quoteOdooPosOrder,
  postOdooSessionCash,
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
import { KeyboardIcon, ParkingIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { friendlyProductName } from "@/lib/product-display-name";
import { splitMoney } from "@/lib/sell-screen";
import { formatOdooDateTime } from "@/lib/odoo-date";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useAuth } from "@/lib/auth";

// Card settlement needs a paired terminal; browser-only checkout must not mark it paid.
const EFTPOS_TERMINAL_ENABLED = false;

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

type ActiveCartDraft = {
  pendingOrder?: OdooCheckoutRequest | null;
  lines: CartLine[];
  paymentMethodId: number | null;
  customer: { id: number; name: string } | null;
  cashTendered: string;
  savedAt: string;
};

function ActionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`action-group-${title.toLowerCase()}`}>
      <h3 id={`action-group-${title.toLowerCase()}`} className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">{title}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>
    </section>
  );
}

function ActionButton({ label, onClick, tone = "blue" }: { label: string; onClick: () => void; tone?: "blue" | "orange" | "neutral" }) {
  const styles = {
    blue: "border-[var(--oh-tile-blue-border)] bg-[var(--oh-tile-blue-bg)] text-[var(--oh-tile-blue-text)]",
    orange: "border-[var(--oh-tile-orange-border)] bg-[var(--oh-tile-orange-bg)] text-[var(--oh-tile-orange-text)]",
    neutral: "border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] text-[var(--oh-text)]",
  }[tone];
  return <button type="button" onClick={onClick} className={`flex min-h-[4.5rem] items-center justify-center rounded-[var(--oh-radius)] border px-2 py-3 text-center text-[13px] font-semibold shadow-[var(--oh-shadow-card)] transition hover:border-[var(--oh-orange)] hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-orange)] ${styles}`}>{label}</button>;
}

function ActionLink({ label, href }: { label: string; href: string }) {
  return <Link href={href} className="flex min-h-[4.5rem] items-center justify-center rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-2 py-3 text-center text-[13px] font-semibold text-[var(--oh-text)] shadow-[var(--oh-shadow-card)] transition hover:border-[var(--oh-orange)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-orange)]">{label}</Link>;
}

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

export function OdooRegisterPage() {
  const { hasPermission } = useAuth();
  const canSell = hasPermission("sell.checkout");
  const canDiscount = hasPermission("sell.discount");
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
  const checkoutBusy = useRef(false);
  const productSearchRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CompletedReceipt | null>(null);
  const [cashTendered, setCashTendered] = useState("");
  const [cashOutOpen, setCashOutOpen] = useState(false);
  const [cashOutAmount, setCashOutAmount] = useState("");
  const [cashOutReason, setCashOutReason] = useState("");
  const [cashOutBusy, setCashOutBusy] = useState(false);
  const [parkedSales, setParkedSales] = useState<ParkedOdooSale[]>([]);
  const [parkedLoaded, setParkedLoaded] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("keys");
  const [catalogHome, setCatalogHome] = useState(true);
  const [mobileCatalogOpen, setMobileCatalogOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
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
      let data = await getOdooPosBootstrap();
      if (revision !== loadRevision.current) return;
      setBootstrap(data);
      let rememberedId: number | null = null;
      try {
        const stored = Number(localStorage.getItem(`${REGISTER_SELECTION_KEY}:${user.id}`));
        if (Number.isSafeInteger(stored) && stored > 0) rememberedId = stored;
      } catch { /* Register selection remains available for this session. */ }
      let active = data.configs.find((item) => item.id === selectedConfigIdRef.current)
        ?? data.configs.find((item) => item.id === rememberedId)
        ?? data.configs.find((item) => item.session)
        ?? data.configs[0];
      if (active && !active.session) {
        await openOdooPosSession(active.id);
        data = await getOdooPosBootstrap();
        active = data.configs.find((item) => item.id === active?.id) ?? data.configs[0];
      }
      selectedConfigIdRef.current = active?.id ?? null;
      setConfigId(active?.id ?? null);
      if (active) {
        try { localStorage.setItem(`${REGISTER_SELECTION_KEY}:${user.id}`, String(active.id)); } catch { /* Register selection remains available for this session. */ }
      }
      const selected = active?.paymentMethods.some((method) => method.id === selectedPaymentMethodIdRef.current)
        ? selectedPaymentMethodIdRef.current
        : active?.paymentMethods.find((method) => /card|eftpos|bank|terminal/i.test(method.name))?.id
          ?? active?.paymentMethods[0]?.id
          ?? null;
      selectedPaymentMethodIdRef.current = selected;
      setPaymentMethodId(selected);
      if (data.message) setError(data.message);
    } catch (cause) {
      if (revision !== loadRevision.current) return;
      if (initial) setConnected(null);
      setError(cause instanceof Error ? cause.message : "Could not load the Orithos register.");
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

  const dialogOpen = helpOpen || closeRegisterCartWarn || clearSaleConfirm || cashOutOpen || Boolean(receipt) || Boolean(parkedAction) || pendingRegisterId !== null;
  useDialogFocus(dialogOpen, () => {
    if (helpOpen) setHelpOpen(false);
    else if (closeRegisterCartWarn) setCloseRegisterCartWarn(false);
    else if (clearSaleConfirm) setClearSaleConfirm(false);
    else if (cashOutOpen && !cashOutBusy) setCashOutOpen(false);
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
      setDraftNotice("Draft restored from this device. Orithos will recheck stock and tax before finalising.");
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
          sellCatalogue: true,
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
  const sessionOpen = Boolean(selectedConfig?.session);
  useEffect(() => {
    if (!sessionOpen || typeof window === "undefined" || !window.matchMedia("(pointer: fine)").matches) return;
    const frame = window.requestAnimationFrame(() => productSearchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [sessionOpen]);
  const currentQuoteFingerprint = JSON.stringify({
    configId,
    paymentMethodId,
    customerId: customer?.id ?? null,
    lines: lines.map((line) => [line.product.id, line.quantity, line.packFactor || 1, line.discountPercent || 0]),
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
    () => Math.round(lines.reduce((sum, line) => sum + provisionalLineUnit(line.product, line.packFactor || 1) * line.quantity * (1 - (line.discountPercent || 0) / 100), 0) * 100) / 100,
    [lines],
  );
  const subtotal = quoteIsCurrent ? quote!.subtotal : fallbackSubtotal;
  const taxTotal = quoteIsCurrent ? quote!.tax : 0;
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
        lines: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity, uomFactor: line.packFactor || 1, discountPercent: line.discountPercent || 0 })),
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
            message: cause instanceof Error ? cause.message : "Orithos could not calculate tax for this cart.",
          });
        }
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [connected, currentQuoteFingerprint, customer, isOnline, lines, paymentMethodId, quoteRetryKey, selectedConfig]);

  function formatStoreDate(value: string, timezone: string) {
    return formatOdooDateTime(value, timezone);
  }

  async function submitCashOut() {
    const amount = Number(cashOutAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a cash out amount greater than $0.00.");
      return;
    }
    if (!selectedConfig) {
      setError("Open a register session before recording cash out.");
      return;
    }
    setCashOutBusy(true);
    setError(null);
    try {
      await postOdooSessionCash({
        configId: selectedConfig.id,
        direction: "out",
        amount: Math.round(amount * 100) / 100,
        reason: cashOutReason.trim() || undefined,
      });
      setCashOutOpen(false);
      setCashOutAmount("");
      setCashOutReason("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cash out could not be recorded.");
    } finally {
      setCashOutBusy(false);
    }
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
        sellCatalogue: true,
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
    const label = friendlyProductName(product.display_name || product.name);
    if (!product.available_in_pos) {
      setError(`${label} is not available for POS sale.`);
      return;
    }
    if (shelfUnitPrice(product) === null) {
      setError(`${label} has no catalogue price. Set a price before selling.`);
      return;
    }
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
      if (selectedConfig?.session && product.free_qty > 0 && product.available_in_pos && shelfUnitPrice(product) !== null) {
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
      const result = await searchOdooRecords<OdooProductRecord>("products", {
        query: query.trim(),
        limit: PRODUCT_PAGE_SIZE,
        sellCatalogue: true,
      });
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
      setError("Connect an Orithos staff account before saving a parked sale.");
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
    if (cardMethod && paymentMethodId === cardMethod.id && !EFTPOS_TERMINAL_ENABLED) {
      setError("EFTPOS is unavailable: connect and validate a terminal before taking card payments.");
      return;
    }
    checkoutBusy.current = true;
    setBusy(true);
    setError(null);
    try {
      const fingerprint = JSON.stringify({
        configId: selectedConfig.id,
        paymentMethodId,
        tendered: tenderedAmount,
        customerId: customer?.id ?? null,
        lines: lines.map((line) => [line.product.id, line.quantity, line.packFactor || 1, line.discountPercent || 0]),
      });
      if (!orderUuid.current || checkoutFingerprint.current !== fingerprint) {
        orderUuid.current = crypto.randomUUID();
        checkoutFingerprint.current = fingerprint;
      }
      const stableOrderUuid = orderUuid.current ?? crypto.randomUUID();
      orderUuid.current = stableOrderUuid;
      const request: OdooCheckoutRequest = pendingCheckout ?? {
        configId: selectedConfig.id,
        paymentMethodId: paymentMethodId!,
        orderUuid: stableOrderUuid,
        customerId: customer?.id ?? null,
        tendered: tenderedAmount,
        expectedQuote: quote?.signature,
        lines: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity, uomFactor: line.packFactor || 1, discountPercent: line.discountPercent || 0 })),
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
      else {
        setPendingCheckout(null);
        if (cause instanceof Error && /Prices or taxes have changed/.test(cause.message)) {
          setQuote(null); setQuoteRetryKey((value) => value + 1);
        }
      }
      setError(cause instanceof Error ? cause.message : "Orithos could not confirm the sale. Keep this order open and retry only after checking sales history.");
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
    <Link href="/history" target="_blank" className="min-h-11 underline">Open sales history in another tab</Link>
    <p className="text-sm">If the result remains unknown, a store administrator must reconcile the order and payment in Orithos before another sale is attempted.</p>
  </main>;

  if (loading) return (
    <main aria-busy="true" aria-label="Loading register" className="flex h-[calc(100dvh-50px)] min-h-0 flex-col overflow-hidden bg-[var(--oh-surface)] p-4 font-sans md:p-5">
      <header className="odoo-register-header relative z-30 mb-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-7 w-14 animate-pulse rounded bg-[var(--oh-border)]" />
        <div className="h-11 w-full max-w-xs animate-pulse rounded-full border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] sm:w-56" />
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]">
        <div className="order-1 shrink-0 lg:order-none lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <div className="flex flex-wrap items-center gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={`pay-${index}`} className="h-11 w-[5.5rem] animate-pulse rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-muted)]" />
            ))}
            <div className="ml-auto h-11 w-24 animate-pulse rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]" />
          </div>
        </div>
        <section className="relative order-2 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] shadow-[var(--oh-shadow-card)] lg:order-none lg:col-start-2 lg:row-start-2">
          <div className="flex shrink-0 items-center gap-1 border-b border-[var(--oh-border)] px-3 py-2">
            <div className="h-11 w-28 animate-pulse rounded-lg bg-[var(--oh-orange-light)]" />
            <div className="h-11 w-32 animate-pulse rounded-lg bg-[var(--oh-surface-muted)]" />
            <div className="h-11 w-28 animate-pulse rounded-lg bg-[var(--oh-surface-muted)]" />
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="h-4 w-20 animate-pulse rounded bg-[var(--oh-border)]" />
              <div className="h-4 w-16 animate-pulse rounded bg-[var(--oh-border)]" />
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 18 }, (_, index) => (
                <div key={`key-${index}`} className="min-h-[4.5rem] animate-pulse rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-muted)]" />
              ))}
            </div>
          </div>
        </section>
        <aside className="order-3 flex w-full shrink-0 flex-col overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] shadow-[var(--oh-shadow-card)] lg:order-none lg:col-start-1 lg:row-start-2 lg:w-auto">
          <div className="border-b border-[var(--oh-border)] px-4 py-3">
            <div className="h-11 w-full animate-pulse rounded-lg border border-dashed border-[var(--oh-border)] bg-[var(--oh-surface-muted)]" />
          </div>
          <div className="border-b border-[var(--oh-border)] px-4 py-3">
            <div className="h-11 w-full animate-pulse rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)]" />
          </div>
          <div className="min-h-[120px] flex-1" />
          <div className="border-t border-[var(--oh-border)] bg-[var(--oh-surface)]/50 p-4">
            <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2">
              <div className="h-3.5 w-16 animate-pulse rounded bg-[var(--oh-border)]" />
              <div className="ml-auto h-3.5 w-20 animate-pulse rounded bg-[var(--oh-border)]" />
              <div className="h-3.5 w-24 animate-pulse rounded bg-[var(--oh-border)]" />
              <div className="ml-auto h-3.5 w-16 animate-pulse rounded bg-[var(--oh-border)]" />
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="h-3.5 w-12 animate-pulse rounded bg-[var(--oh-border)]" />
              <div className="h-8 w-28 animate-pulse rounded bg-[var(--oh-border)]" />
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
  if (connected === null) return (
    <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
      <section role="alert" className="max-w-lg rounded-xl border border-rose-200 bg-[var(--oh-surface-elevated)] p-7 text-center shadow-[var(--oh-shadow-card)]">
        <CircleAlert className="mx-auto text-rose-700" size={30} />
        <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Could not load the Orithos register</h1>
        <p className="mt-2 text-sm leading-6 text-rose-800">{error ?? "The register details could not be read."}</p>
        <button type="button" onClick={() => void loadPos(true)} className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]"><RefreshCw size={16} /> Retry</button>
      </section>
    </main>
  );
  if (connected === false) return (
    <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
      <section className="max-w-lg rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-7 text-center shadow-[var(--oh-shadow-card)]">
        <CircleAlert className="mx-auto text-amber-600" size={30} />
        <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Connect Orithos to open the register</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Sign in with your Orithos staff account in Integrations first. This register reads products, customers, sessions and payments from Orithos.</p>
        <Link href="/settings/integrations" className="mt-5 inline-flex h-10 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Connect Orithos</Link>
      </section>
    </main>
  );

  const { whole: totalWhole, cents: totalCents } = splitMoney(amountToCollect);
  const cashEnough = Number.isFinite(tenderedAmount) && tenderedAmount + 0.001 >= amountToCollect;
  const canFinalise = Boolean(canSell && isOnline && lines.length && quoteIsCurrent && !quoteLoading && selectedConfig?.session && paymentMethodId && !busy && cashEnough);
  const finaliseLabel = !canSell
    ? "No sell permission"
    : busy
    ? "Processing…"
    : !isOnline
      ? "Reconnect to finalise"
      : !selectedConfig?.session
        ? "No session"
        : !lines.length
          ? "Finalise Sale"
          : quoteLoading
            ? "Calculating…"
            : quoteError || !quoteIsCurrent
              ? "Waiting for tax…"
              : !paymentMethodId
                ? "Select payment"
                : isCashPayment && !cashEnough
                    ? "Enter cash received"
                    : "Finalise Sale";

  function handleFinaliseClick() {
    void checkout();
  }

  const finaliseTitle = canFinalise ? "Complete this sale in Orithos" : finaliseLabel;

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
    const nextPaymentMethodId = config?.paymentMethods.find((method) => /card|eftpos|bank|terminal/i.test(method.name))?.id
      ?? config?.paymentMethods[0]?.id
      ?? null;
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
    if (exact && quoteIsCurrent) setCashTendered(amountToCollect.toFixed(2));
    else if (!exact) setCashTendered("");
  }

  function selectCardPayment() {
    if (!EFTPOS_TERMINAL_ENABLED) {
      setError("EFTPOS is unavailable: connect and validate a terminal before taking card payments.");
      return;
    }
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

  function applyDiscount() {
    if (!canDiscount) return;
    const line = targetCartLine();
    if (!line) return;
    const input = window.prompt("Discount percentage (0-100)", String(line.discountPercent ?? 0));
    if (input === null) return;
    const value = Number(input);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setError("Discount must be a percentage from 0 to 100.");
      return;
    }
    const rounded = Math.round(value * 100) / 100;
    setLines((current) => current.map((item) =>
      item.product.id === line.product.id && (item.packFactor || 1) === (line.packFactor || 1)
        ? { ...item, discountPercent: rounded || undefined }
        : item,
    ));
    setError(null);
  }

  function clearSale() {
    setLines([]);
    setCustomer(null);
    setCustomerQuery("");
    setCustomers([]);
    setCashTendered("");
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
    setMobileCatalogOpen(window.matchMedia("(max-width: 1023px)").matches);
  }

  function openQuickCategory(name: string) {
    const match = posCategories.find((category) => friendlyProductName(category.name).toLowerCase() === name.toLowerCase())
      ?? posCategories.find((category) => friendlyProductName(category.name).toLowerCase().includes(name.toLowerCase()));
    if (match) {
      openCategory(match.id);
      return;
    }
    setCategoryId(null);
    setCatalogHome(false);
    setWorkspaceTab("keys");
    setQuery(name);
    setProductActiveIndex(-1);
    setMobileCatalogOpen(window.matchMedia("(max-width: 1023px)").matches);
  }

  function backToCatalogHome() {
    setCatalogHome(true);
    setCategoryId(null);
    setQuery("");
    setProductActiveIndex(-1);
    setMobileCatalogOpen(false);
    setMobileCartOpen(false);
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
  const productCount = lines.length;
  const cashMethod = paymentMethods.find((item) => isCashMethod(item)) ?? null;
  const nonCashMethods = paymentMethods.filter((item) => !isCashMethod(item));
  const cardMethod = nonCashMethods.find((item) => /card|eftpos|bank|terminal/i.test(item.name))
    ?? nonCashMethods.find((item) => !/account|customer|credit|pay.?later/i.test(item.name))
    ?? nonCashMethods[0]
    ?? null;
  const eftposSelected = Boolean(cardMethod && paymentMethodId === cardMethod.id);
  const cashSelected = Boolean(cashMethod && paymentMethodId === cashMethod.id);

  return (
    <main className="flex h-[calc(100dvh-50px)] min-h-0 flex-col overflow-hidden bg-[var(--oh-surface)] p-4 font-sans md:p-5">
      <div className="odoo-register-header relative z-30 mb-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[20px] font-semibold leading-tight text-[var(--oh-text)]">Sell</h1>
        </div>
        <div className="odoo-register-actions flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <div
            className="inline-flex w-full min-w-0 items-center gap-2 rounded-full border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] py-1 pl-3 pr-1 shadow-sm sm:w-auto"
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
              className="min-w-0 max-w-[105px] flex-1 truncate border-0 bg-transparent py-1 text-sm font-semibold text-[var(--oh-text)] outline-none sm:max-w-[160px] sm:flex-none"
            >
              {bootstrap?.configs.map((config) => (
                <option key={config.id} value={config.id}>{config.name}{config.session ? "" : " · Closed"}</option>
              ))}
            </select>
            <button type="button" onClick={() => void loadPos()} disabled={refreshing} title="Refresh register data" aria-label="Refresh register data" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] disabled:opacity-60">
              {refreshing ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            </button>
            <SalesMenu config={selectedConfig} onHelp={() => setHelpOpen(true)} />
            <button type="button" onClick={requestCloseRegister} title="Close register" aria-label="Close register" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]">
              <DoorClosed size={17} />
            </button>
          </div>
        </div>
      </div>

      {!selectedConfig?.session && (
        <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          <span>No open session — Orithos will try to open this register automatically.</span>
          <button type="button" onClick={() => void loadPos()} disabled={refreshing} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-[var(--sf-cta)] px-3 font-semibold text-white hover:bg-[var(--sf-cta-hover)] disabled:opacity-60">{refreshing ? "Opening…" : "Retry register"}</button>
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
          Orithos is still confirming this sale. Keep this window open and do not submit the sale again.
        </div>
      )}
      {error && (
        <div role="alert" className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="grid h-11 w-11 shrink-0 place-items-center rounded-md font-bold hover:bg-red-100">×</button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]">
        <section className={cn(
          "relative order-2 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] shadow-[var(--oh-shadow-card)] lg:order-none lg:col-start-2 lg:row-start-2",
          mobileCatalogOpen && "fixed inset-x-0 top-[50px] bottom-0 z-50 rounded-none lg:static lg:inset-auto lg:z-auto lg:rounded-[var(--oh-radius)]",
        )}>
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
              <OdooSellParkedList
                sales={visibleParkedSales}
                formatDate={formatParkedDate}
                onResume={requestResumeParkedSale}
                onDiscard={(saleId) => setParkedAction({ type: "discard", saleId })}
              />
            ) : workspaceTab === "more" ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">Register actions</p>
                  <button type="button" onClick={() => setWorkspaceTab("keys")} className="cursor-pointer text-[13px] font-medium text-[var(--oh-orange)] hover:underline">
                    ← Back to Quick Keys
                  </button>
                </div>
                <ActionGroup title="Transaction">
                  <ActionButton label="All products" onClick={() => { setWorkspaceTab("keys"); openCategory(null); }} />
                  <ActionButton label="Sales History" onClick={() => openSalesHistory()} />
                  <ActionButton label="Parked Sales" onClick={() => setWorkspaceTab("parked")} />
                  <ActionButton label="POS Help" onClick={() => setHelpOpen(true)} tone="orange" />
                </ActionGroup>
                <ActionGroup title="Operations">
                  <ActionLink label="Gift Cards" href="/giftcards" />
                  <ActionLink label="Customer Payments" href="/customers/balances" />
                  <ActionLink label="Sales Reports" href="/reports/sales" />
                  <ActionButton label="Close Register" onClick={requestCloseRegister} />
                </ActionGroup>
              </div>
            ) : (
              <OdooSellCatalogWorkspace
                showCatalogHome={showCatalogHome}
                showMobileCartButton={mobileCatalogOpen}
                onViewCart={() => {
                  setMobileCatalogOpen(false);
                  setMobileCartOpen(true);
                }}
                categoriesError={categoriesError}
                categoriesLoading={categoriesLoading}
                categoryTiles={categoryTiles}
                onOpenQuickCategory={openQuickCategory}
                onRetryCategories={() => setCategoryRetryKey((value) => value + 1)}
                onOpenCategory={openCategory}
                linesLength={lines.length}
                targetLineQuantity={targetCartLine()?.quantity ?? 0}
                onIncrementQty={() => { const line = targetCartLine(); if (line) changeQuantity(line.product.id, line.packFactor || 1, 1); }}
                onDecrementQty={() => { const line = targetCartLine(); if (line) changeQuantity(line.product.id, line.packFactor || 1, -1); }}
                onCaseQuantity={applyCaseQuantity}
                onReturnItem={() => openSalesHistory()}
                canDiscount={canDiscount}
                onDiscount={applyDiscount}
                onPark={() => parkCurrentSale()}
                onClear={requestClearSale}
                parkedLoaded={parkedLoaded}
                hasConfig={Boolean(selectedConfig)}
                busy={busy}
                backToCatalogHome={backToCatalogHome}
                categoryId={categoryId}
                query={query}
                posCategories={posCategories}
                hideOutOfStock={hideOutOfStock}
                onHideOutOfStockChange={setHideOutOfStock}
                catalogDensity={catalogDensity}
                onCatalogDensityChange={setCatalogDensity}
                products={products}
                productsLoading={productsLoading}
                productsError={productsError}
                productsHasNext={productsHasNext}
                productsLoadingMore={productsLoadingMore}
                productActiveIndex={productActiveIndex}
                sessionOpen={sessionOpen}
                onRetryProducts={() => setProductRetryKey((value) => value + 1)}
                onLoadMoreProducts={() => void loadMoreProducts()}
                onAddProduct={addProduct}
              />
            )}
          </div>
        </section>

        {quoteIsCurrent && quote?.priceSource && <p role="status" className="px-3 text-xs text-[var(--oh-muted)]">Pricing: {quote.priceSource} · {quote.currency}</p>}
        <OdooSellPaymentBar
          linesLength={lines.length}
          eftposSelected={eftposSelected}
          cashSelected={cashSelected}
          cardMethod={cardMethod}
          cashMethod={cashMethod}
          selectedPayment={selectedPayment ?? null}
          hasConfig={Boolean(selectedConfig)}
          eftposAvailable={EFTPOS_TERMINAL_ENABLED}
          busy={busy}
          isCashPayment={isCashPayment}
          amountToCollect={amountToCollect}
          cashTendered={cashTendered}
          tenderedAmount={tenderedAmount}
          changeDue={changeDue}
          totalWhole={totalWhole}
          totalCents={totalCents}
          onSelectCard={() => selectCardPayment()}
          onSelectCash={() => selectCashPayment(true)}
          onCashOut={() => { setCashOutAmount(""); setCashOutReason(""); setCashOutOpen(true); }}
          onClear={requestClearSale}
          onCashTenderedChange={(value) => { setExactCashArmed(false); setCashTendered(value); }}
        />

        <OdooSellCartAside
          mobileOpen={mobileCartOpen}
          onCloseMobile={() => {
            setMobileCartOpen(false);
            setMobileCatalogOpen(true);
          }}
          customer={customer}
          customerQuery={customerQuery}
          customers={customers}
          customerSearchLoading={customerSearchLoading}
          customerSearchError={customerSearchError}
          customerActiveIndex={customerActiveIndex}
          onCustomerQueryChange={(value) => { setCustomers([]); setCustomerQuery(value); }}
          onCustomerSearchKeyDown={handleCustomerSearchKeyDown}
          onSelectCustomer={selectCustomer}
          onRemoveCustomer={() => setCustomer(null)}
          onRetryCustomerSearch={() => setCustomerSearchKey((value) => value + 1)}
          query={query}
          productSearchRef={productSearchRef}
          productsLength={products.length}
          productActiveOptionId={productActiveIndex >= 0 ? `pos-product-option-${products[productActiveIndex]?.id}` : undefined}
          productsLoading={productsLoading}
          onProductQueryChange={(value) => {
            setProductsError(null);
            setProductActiveIndex(-1);
            setQuery(value);
            setCatalogHome(false);
            setWorkspaceTab("keys");
          }}
          onProductSearchKeyDown={(event) => void handleProductSearchKeyDown(event)}
          lines={lines}
          selectedLineKey={selectedLineKey}
          quote={quote}
          quoteIsCurrent={quoteIsCurrent}
          onSelectLine={setSelectedLineKey}
          onRemoveLine={(productId, packFactor, key) => {
            setLines((current) => current.filter((line) => !(line.product.id === productId && (line.packFactor || 1) === packFactor)));
            if (selectedLineKey === key) setSelectedLineKey(null);
          }}
          onChangeQuantity={changeQuantity}
          onSetPackFactor={(productId, currentFactor, nextFactor) => {
            setLinePackFactor(productId, currentFactor, nextFactor);
            setSelectedLineKey(lineKey(productId, nextFactor));
          }}
          lineKey={lineKey}
          quantity={quantity}
          productCount={productCount}
          subtotal={subtotal}
          taxTotal={taxTotal}
          quoteLoading={quoteLoading}
          quoteError={quoteError}
          showQuoteRetry={Boolean(connected && isOnline && selectedConfig?.session && paymentMethodId && lines.length > 0)}
          onRetryQuote={() => { setQuoteFailure(null); setQuoteRetryKey((value) => value + 1); }}
          canFinalise={canFinalise}
          finaliseLabel={finaliseLabel}
          finaliseTitle={finaliseTitle}
          onFinalise={handleFinaliseClick}
          showFinaliseHint={!canFinalise && lines.length > 0 && !busy && isOnline && Boolean(selectedConfig?.session) && finaliseLabel !== "Finalise Sale"}
          totalWhole={totalWhole}
          totalCents={totalCents}
          busy={busy}
        />
      </div>

      {cashOutOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !cashOutBusy) setCashOutOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="cash-out-title" className="w-full max-w-md rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="cash-out-title" className="text-lg font-semibold text-[var(--oh-text)]">Cash Out</h2>
                <p className="mt-1 text-sm text-[var(--oh-muted)]">Record cash removed from this open register session.</p>
              </div>
              <button type="button" onClick={() => setCashOutOpen(false)} disabled={cashOutBusy} aria-label="Close cash out" className="grid h-11 w-11 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] disabled:opacity-50"><X size={18} /></button>
            </div>
            <label className="mt-5 grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">
              Amount
              <input autoFocus type="number" min="0.01" step="0.01" inputMode="decimal" value={cashOutAmount} onChange={(event) => setCashOutAmount(event.target.value)} className="h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 tabular-nums outline-none focus:border-[var(--oh-primary)]" placeholder="0.00" />
            </label>
            <label className="mt-4 grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">
              Reason <span className="font-normal text-[var(--oh-muted)]">(optional)</span>
              <input type="text" value={cashOutReason} onChange={(event) => setCashOutReason(event.target.value)} className="h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 outline-none focus:border-[var(--oh-primary)]" placeholder="Safe drop, supplier payment…" />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setCashOutOpen(false)} disabled={cashOutBusy} className="min-h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void submitCashOut()} disabled={cashOutBusy} className="min-h-11 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-wait disabled:opacity-60">{cashOutBusy ? "Recording…" : "Record cash out"}</button>
            </div>
          </section>
        </div>
      )}

            {receipt && <div role="dialog" aria-modal="true" aria-labelledby="sale-complete-title" className="receipt-overlay fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setReceipt(null); }}>
        <section className="receipt-print my-auto w-full max-w-sm rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-6 shadow-2xl">
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
        <section role="alertdialog" aria-modal="true" aria-labelledby="parked-action-title" aria-describedby="parked-action-description" className="w-full max-w-md rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-6 shadow-2xl">
          <h2 id="parked-action-title" className="text-lg font-semibold text-[var(--oh-text)]">{parkedAction.type === "resume" ? "Replace the current sale?" : "Discard this parked sale?"}</h2>
          <p id="parked-action-description" className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">{parkedAction.type === "resume" ? "Your current cart will be replaced with the parked sale. The parked sale will be removed from this terminal." : "This removes the saved draft from this terminal. It does not cancel or change any completed Orithos sale."}</p>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setParkedAction(null)} className="min-h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Cancel</button><button type="button" onClick={confirmParkedAction} className={`min-h-11 rounded-md px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] ${parkedAction.type === "discard" ? "bg-red-700 hover:bg-red-800" : "bg-[var(--sf-link-blue)] hover:brightness-95"}`}>{parkedAction.type === "resume" ? "Resume sale" : "Discard draft"}</button></div>
        </section>
      </div>}
      {pendingRegisterId !== null && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
        <section role="alertdialog" aria-modal="true" aria-labelledby="register-change-title" aria-describedby="register-change-description" className="w-full max-w-md rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-6 shadow-2xl">
          <h2 id="register-change-title" className="text-lg font-semibold text-[var(--oh-text)]">Park this sale before switching?</h2>
          <p id="register-change-description" className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">The current cart belongs to {selectedConfig?.name ?? "this register"}. It will be saved on this terminal and will only appear when you return to that register.</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setPendingRegisterId(null)} className="h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)]">Stay here</button>
            <button type="button" onClick={() => { const nextId = pendingRegisterId; if (parkCurrentSale() && nextId !== null) selectRegister(nextId); }} className="h-11 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Park &amp; switch</button>
          </div>
        </section>
      </div>}
      {helpOpen && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="pos-help-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-5 shadow-2xl sm:p-6">
          <header className="flex items-start justify-between gap-4 border-b border-[var(--oh-border)] pb-4">
            <div><h2 id="pos-help-title" className="text-lg font-semibold text-[var(--oh-text)]">POS help and recovery</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Steps for the current register screen.</p></div>
            <button type="button" onClick={() => setHelpOpen(false)} aria-label="Close POS help" className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><X size={18} /></button>
          </header>
          <div className="mt-5 grid gap-4 text-sm leading-6 text-[var(--oh-text-secondary)]">
            <section><h3 className="font-semibold text-[var(--oh-text)]">Payment is still processing</h3><p className="mt-1">Keep this page open and do not submit again. Check Sales History before retrying if the result is unknown.</p></section>
            <section><h3 className="font-semibold text-[var(--oh-text)]">Tax or total could not be calculated</h3><p className="mt-1">Use Retry quote with the same cart. Finalise stays locked until Orithos returns a fresh total.</p></section>
            <section><h3 className="font-semibold text-[var(--oh-text)]">Connection is offline</h3><p className="mt-1">The cart remains on this device. Reconnect, wait for the online indicator, then retry the quote before finalising.</p></section>
            <section><h3 className="font-semibold text-[var(--oh-text)]">Register is closed or products are missing</h3><p className="mt-1">Refresh after opening the matching Orithos POS session. Product availability comes from the selected register&apos;s Orithos inventory context.</p></section>
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
            className="w-full max-w-md rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-6 shadow-2xl"
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
            className="w-full max-w-md rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-6 shadow-2xl"
          >
            <h2 id="clear-sale-title" className="text-lg font-semibold text-[var(--oh-text)]">Clear this sale?</h2>
            <p id="clear-sale-description" className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">
              This removes all lines and the selected customer from the cart. It does not change any completed Orithos sale.
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
