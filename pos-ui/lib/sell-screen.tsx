"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  browseProducts,
  browsePromotions,
  listParkedSales,
  parkSale,
  quickKeyProduct,
  resumeParkedSale,
  searchSell,
  sellAction,
  type ParkedSale,
  type ProductBrowseItem,
  type PromotionBrowseItem,
  type PromotionPeriod,
  type SellCustomerHit,
  type SellProductHit,
  type SellSearchResult,
} from "@/lib/api";

/** A product line in the current sale. */
export interface SaleLine {
  id: string;
  name: string;
  unitPrice: number;
  qty: number;
}

/** A customer attached to the sale. */
export interface Customer {
  id: string;
  name: string;
  group: string;
  loyaltyPoints: number;
}

export type LeftView = "keys" | "parked" | "customers" | "promotions" | "products";
export type PaymentMethod =
  | "EFTPOS VISA MasterCard"
  | "Exact Cash"
  | "Eftpos Cash Out"
  | "Finalise";
export type PaymentPhase = "processing" | "approved" | "error";

export interface CheckoutResult {
  tendered: number;
  change: number;
  cashout: number;
  invoiceId: string | null;
  paymentMethodName: string | null;
}

export interface PaymentState {
  method: PaymentMethod;
  kind: "card" | "cash";
  amountDue: number;
  tendered: number;
  change: number;
  invoiceId: string | null;
  paymentMethodName: string | null;
  phase: PaymentPhase;
  error: string | null;
}

function toCustomer(hit: SellCustomerHit): Customer {
  return {
    id: hit.id,
    name: hit.name,
    group: hit.groupName ?? "Customers",
    loyaltyPoints: hit.loyaltyPoints,
  };
}

interface SellScreenState {
  lines: SaleLine[];
  selectedId: string | null;
  customer: Customer | null;
  keypadPage: number;
  view: LeftView;
  pendingAction: string | null;
  actionMessage: string | null;
  confirmClearOpen: boolean;
  payment: PaymentState | null;
  searchQuery: string;
  searchResults: SellSearchResult | null;
  searchOpen: boolean;
  customers: Customer[];
  parkedSales: ParkedSale[];
  parkedLoading: boolean;
  busy: boolean;
  promotionPeriod: PromotionPeriod;
  promotionFilter: string;
  promotionItems: PromotionBrowseItem[];
  promotionLoading: boolean;
  promotionMenuOpen: boolean;
  productFolder: string;
  productItems: ProductBrowseItem[];
  productLoading: boolean;

  addProduct: (p: { id: string; name: string; unitPrice: number }) => void;
  selectLine: (id: string) => void;
  incQty: (amount?: number) => void;
  decQty: () => void;
  removeLine: (id: string) => void;
  requestClear: () => void;
  confirmClear: () => void;
  cancelClear: () => void;
  setKeypadPage: (n: number) => void;
  setView: (v: LeftView) => void;
  setCustomer: (c: Customer | null) => void;
  runAction: (name: string) => void;
  dismissAction: () => void;
  startPayment: (method: PaymentMethod) => void;
  settlePayment: (result: CheckoutResult) => void;
  failPayment: (message: string) => void;
  retryPayment: () => void;
  completeSale: () => void;
  cancelPayment: () => void;
  setSearchQuery: (q: string) => void;
  setSearchOpen: (open: boolean) => void;
  pickSearchProduct: (p: SellProductHit) => void;
  pickSearchCustomer: (c: SellCustomerHit) => void;
  addQuickKey: (key: string) => void;
  applyCaseQuantity: () => void;
  parkCurrentSale: () => void;
  resumeParked: (id: string) => void;
  refreshParked: () => void;
  loadCustomers: (q?: string) => void;
  openPromotions: () => void;
  openProducts: (folder?: string) => void;
  setPromotionPeriod: (p: PromotionPeriod) => void;
  setPromotionFilter: (q: string) => void;
  setPromotionMenuOpen: (open: boolean) => void;
  pickPromotionProduct: (item: PromotionBrowseItem) => void;
  pickBrowseProduct: (item: ProductBrowseItem) => void;
  backToKeys: () => void;

  itemCount: number;
  productCount: number;
  total: number;
}

const SellScreenContext = createContext<SellScreenState | null>(null);

export function SellScreenProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [keypadPage, setKeypadPage] = useState(0);
  const [view, setView] = useState<LeftView>("keys");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [searchQuery, setSearchQueryState] = useState("");
  const [searchResults, setSearchResults] = useState<SellSearchResult | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [parkedSales, setParkedSales] = useState<ParkedSale[]>([]);
  const [parkedLoading, setParkedLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [promotionPeriod, setPromotionPeriodState] = useState<PromotionPeriod>("current");
  const [promotionFilter, setPromotionFilterState] = useState("");
  const [promotionItems, setPromotionItems] = useState<PromotionBrowseItem[]>([]);
  const [promotionLoading, setPromotionLoading] = useState(false);
  const [promotionMenuOpen, setPromotionMenuOpen] = useState(false);
  const [productFolder, setProductFolder] = useState("Products");
  const [productItems, setProductItems] = useState<ProductBrowseItem[]>([]);
  const [productLoading, setProductLoading] = useState(false);

  const addProduct = useCallback(
    (p: { id: string; name: string; unitPrice: number }) => {
      setLines((prev) => {
        const existing = prev.find((l) => l.id === p.id);
        if (existing) {
          return prev.map((l) =>
            l.id === p.id ? { ...l, qty: l.qty + 1 } : l,
          );
        }
        return [...prev, { ...p, qty: 1 }];
      });
      setSelectedId(p.id);
    },
    [],
  );

  const selectLine = useCallback((id: string) => setSelectedId(id), []);

  const incQty = useCallback((amount = 1) => {
    setLines((prev) => {
      const targetId = selectedId ?? prev[prev.length - 1]?.id;
      if (!targetId) return prev;
      return prev.map((l) =>
        l.id === targetId ? { ...l, qty: l.qty + amount } : l,
      );
    });
  }, [selectedId]);

  const decQty = useCallback(() => {
    setLines((prev) => {
      const targetId = selectedId ?? prev[prev.length - 1]?.id;
      if (!targetId) return prev;
      return prev.map((l) =>
        l.id === targetId ? { ...l, qty: Math.max(1, l.qty - 1) } : l,
      );
    });
  }, [selectedId]);

  const removeLine = useCallback((id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const requestClear = useCallback(() => {
    if (lines.length > 0) setConfirmClearOpen(true);
  }, [lines.length]);

  const confirmClear = useCallback(() => {
    setLines([]);
    setSelectedId(null);
    setCustomer(null);
    setConfirmClearOpen(false);
    setView("keys");
    setKeypadPage(0);
  }, []);

  const cancelClear = useCallback(() => setConfirmClearOpen(false), []);

  const runAction = useCallback((name: string) => {
    const key = name.toUpperCase().replace(/\s+/g, "_");
    setBusy(true);
    sellAction(key, selectedId)
      .then((res) => {
        setPendingAction(name);
        setActionMessage(res.message);
      })
      .catch(() => {
        setPendingAction(name);
        setActionMessage(`"${name}" requires the POS backend.`);
      })
      .finally(() => setBusy(false));
  }, [selectedId]);

  const dismissAction = useCallback(() => {
    setPendingAction(null);
    setActionMessage(null);
  }, []);

  const startPayment = useCallback((method: PaymentMethod) => {
    setLines((cur) => {
      const amountDue = cur.reduce((n, l) => n + l.qty * l.unitPrice, 0);
      if (amountDue <= 0) return cur;
      const kind: PaymentState["kind"] = method === "Exact Cash" ? "cash" : "card";
      setPayment({
        method,
        kind,
        amountDue,
        tendered: amountDue,
        change: 0,
        invoiceId: null,
        paymentMethodName: null,
        phase: "processing",
        error: null,
      });
      return cur;
    });
  }, []);

  const settlePayment = useCallback(
    (result: CheckoutResult) =>
      setPayment((p) =>
        p
          ? {
              ...p,
              phase: "approved",
              error: null,
              tendered: result.tendered,
              change: result.change,
              invoiceId: result.invoiceId,
              paymentMethodName: result.paymentMethodName,
            }
          : p,
      ),
    [],
  );

  const failPayment = useCallback(
    (message: string) =>
      setPayment((p) => (p ? { ...p, phase: "error", error: message } : p)),
    [],
  );

  const retryPayment = useCallback(
    () => setPayment((p) => (p ? { ...p, phase: "processing", error: null } : p)),
    [],
  );

  const completeSale = useCallback(() => {
    setLines([]);
    setSelectedId(null);
    setCustomer(null);
    setView("keys");
    setKeypadPage(0);
    setPayment(null);
  }, []);

  const cancelPayment = useCallback(() => setPayment(null), []);

  const setSearchQuery = useCallback((q: string) => {
    setSearchQueryState(q);
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    searchSell(q)
      .then(setSearchResults)
      .catch(() => setSearchResults({ products: [], customers: [] }));
  }, []);

  const pickSearchProduct = useCallback(
    (p: SellProductHit) => {
      addProduct({ id: p.id, name: p.name, unitPrice: p.price });
      setSearchQueryState("");
      setSearchResults(null);
      setSearchOpen(false);
      setView("keys");
    },
    [addProduct],
  );

  const pickSearchCustomer = useCallback((c: SellCustomerHit) => {
    setCustomer(toCustomer(c));
    setSearchQueryState("");
    setSearchResults(null);
    setSearchOpen(false);
    setView("keys");
  }, []);

  const addQuickKey = useCallback(
    (key: string) => {
      quickKeyProduct(key)
        .then((hit) => {
          if (hit) addProduct({ id: hit.id, name: hit.name, unitPrice: hit.price });
          else {
            setPendingAction("Quick key");
            setActionMessage("This quick key is not mapped to a live Odoo product.");
          }
        })
        .catch(() => {
          setPendingAction("Quick key");
          setActionMessage("Could not load the live product for this quick key.");
        });
    },
    [addProduct],
  );

  const applyCaseQuantity = useCallback(() => {
    if (lines.length === 0) return;
    const targetId = selectedId ?? lines[lines.length - 1]?.id;
    sellAction("CASE_QUANTITY", targetId)
      .then((res) => {
        const amount = res.caseQuantity;
        if (amount && amount > 0) incQty(amount);
        else {
          setPendingAction("Case quantity");
          setActionMessage("Case quantity is not configured for this live product.");
        }
      })
      .catch(() => {
        setPendingAction("Case quantity");
        setActionMessage("Could not load case quantity from the POS backend.");
      });
  }, [lines, selectedId, incQty]);

  const cartPayload = useCallback(
    () => ({
      customerId: customer?.id ?? null,
      items: lines.map((l) => ({
        productId: l.id,
        name: l.name,
        quantity: l.qty,
        unitPrice: l.unitPrice,
        lineTotal: Math.round(l.qty * l.unitPrice * 100) / 100,
      })),
    }),
    [lines, customer],
  );

  const parkCurrentSale = useCallback(() => {
    if (lines.length === 0) return;
    setBusy(true);
    parkSale(cartPayload())
      .then(() => {
        setLines([]);
        setSelectedId(null);
        setCustomer(null);
        setView("parked");
        return listParkedSales();
      })
      .then(setParkedSales)
      .catch(() => {
        setPendingAction("Park Sale");
        setActionMessage("Could not park the sale. Sign in and ensure the backend is running.");
      })
      .finally(() => setBusy(false));
  }, [lines.length, cartPayload]);

  const resumeParked = useCallback((id: string) => {
    setBusy(true);
    resumeParkedSale(id)
      .then((sale) => {
        const restored: SaleLine[] = (sale.items ?? []).map((item) => ({
          id: item.productId ?? item.id,
          name: item.note ?? "Product",
          unitPrice: Number(item.basePrice),
          qty: Math.max(1, Number(item.quantity)),
        }));
        setLines(restored);
        setSelectedId(restored[0]?.id ?? null);
        setView("keys");
        setKeypadPage(0);
        return listParkedSales();
      })
      .then(setParkedSales)
      .catch(() => {
        setPendingAction("Resume Sale");
        setActionMessage("Could not resume the parked sale.");
      })
      .finally(() => setBusy(false));
  }, []);

  const refreshParked = useCallback(() => {
    setParkedLoading(true);
    listParkedSales()
      .then(setParkedSales)
      .catch(() => setParkedSales([]))
      .finally(() => setParkedLoading(false));
  }, []);

  const loadCustomers = useCallback((q?: string) => {
    searchSell(q ?? "")
      .then((res) => {
        if (res.customers.length > 0) {
          setCustomers(res.customers.map(toCustomer));
        } else if (!q) {
          setCustomers([]);
        }
      })
      .catch(() => {
        if (!q) setCustomers([]);
      });
  }, []);

  const loadPromotionBrowse = useCallback((period: PromotionPeriod, q: string) => {
    setPromotionLoading(true);
    browsePromotions(period, q || undefined)
      .then((res) => setPromotionItems(res.items))
      .catch(() => setPromotionItems([]))
      .finally(() => setPromotionLoading(false));
  }, []);

  const loadProductBrowse = useCallback((folder: string, q?: string) => {
    setProductLoading(true);
    const category =
      folder === "Products" ? undefined : folder.replace(/s$/i, "");
    browseProducts(category, q)
      .then((res) => {
        setProductItems(res.items);
        setProductFolder(res.folderName);
      })
      .catch(() => setProductItems([]))
      .finally(() => setProductLoading(false));
  }, []);

  const backToKeys = useCallback(() => {
    setView("keys");
    setKeypadPage(0);
    setPromotionMenuOpen(false);
  }, []);

  const openPromotions = useCallback(() => {
    setView("promotions");
    setPromotionPeriodState("current");
    setPromotionFilterState("");
    loadPromotionBrowse("current", "");
  }, [loadPromotionBrowse]);

  const openProducts = useCallback(
    (folder = "Products") => {
      setView("products");
      setProductFolder(folder);
      loadProductBrowse(folder);
    },
    [loadProductBrowse],
  );

  const setPromotionPeriod = useCallback(
    (period: PromotionPeriod) => {
      setPromotionPeriodState(period);
      setPromotionMenuOpen(false);
      loadPromotionBrowse(period, promotionFilter);
    },
    [promotionFilter, loadPromotionBrowse],
  );

  const setPromotionFilter = useCallback(
    (q: string) => {
      setPromotionFilterState(q);
      loadPromotionBrowse(promotionPeriod, q);
    },
    [promotionPeriod, loadPromotionBrowse],
  );

  const pickPromotionProduct = useCallback(
    (item: PromotionBrowseItem) => {
      addProduct({ id: item.productId, name: item.productName, unitPrice: item.price });
      backToKeys();
    },
    [addProduct, backToKeys],
  );

  const pickBrowseProduct = useCallback(
    (item: ProductBrowseItem) => {
      addProduct({ id: item.id, name: item.name, unitPrice: item.price });
      backToKeys();
    },
    [addProduct, backToKeys],
  );

  useEffect(() => {
    if (view === "parked") refreshParked();
  }, [view, refreshParked]);

  useEffect(() => {
    if (view === "customers") loadCustomers();
  }, [view, loadCustomers]);

  const { itemCount, productCount, total } = useMemo(() => {
    const items = lines.reduce((n, l) => n + l.qty, 0);
    const sum = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0);
    return { itemCount: items, productCount: lines.length, total: sum };
  }, [lines]);

  const value: SellScreenState = {
    lines,
    selectedId,
    customer,
    keypadPage,
    view,
    pendingAction,
    actionMessage,
    confirmClearOpen,
    payment,
    searchQuery,
    searchResults,
    searchOpen,
    customers,
    parkedSales,
    parkedLoading,
    busy,
    promotionPeriod,
    promotionFilter,
    promotionItems,
    promotionLoading,
    promotionMenuOpen,
    productFolder,
    productItems,
    productLoading,
    addProduct,
    selectLine,
    incQty,
    decQty,
    removeLine,
    requestClear,
    confirmClear,
    cancelClear,
    setKeypadPage,
    setView,
    setCustomer,
    runAction,
    dismissAction,
    startPayment,
    settlePayment,
    failPayment,
    retryPayment,
    completeSale,
    cancelPayment,
    setSearchQuery,
    setSearchOpen,
    pickSearchProduct,
    pickSearchCustomer,
    addQuickKey,
    applyCaseQuantity,
    parkCurrentSale,
    resumeParked,
    refreshParked,
    loadCustomers,
    openPromotions,
    openProducts,
    setPromotionPeriod,
    setPromotionFilter,
    setPromotionMenuOpen,
    pickPromotionProduct,
    pickBrowseProduct,
    backToKeys,
    itemCount,
    productCount,
    total,
  };

  return (
    <SellScreenContext.Provider value={value}>
      {children}
    </SellScreenContext.Provider>
  );
}

export function useSellScreen() {
  const ctx = useContext(SellScreenContext);
  if (!ctx) {
    throw new Error("useSellScreen must be used within a SellScreenProvider");
  }
  return ctx;
}

export function splitMoney(value: number): { whole: string; cents: string } {
  const fixed = value.toFixed(2);
  const [whole, cents] = fixed.split(".");
  return { whole, cents };
}
