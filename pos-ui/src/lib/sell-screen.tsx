"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DEFAULT_GST_PERCENT, includedGst } from "@/lib/au";
import {
  browseProducts,
  browsePromotions,
  listParkedSales,
  parkSale,
  quickKeyProduct,
  quickKeyProductById,
  resumeParkedSale,
  voidParkedSale,
  searchSell,
  searchCustomers,
  searchProducts,
  sellAction,
  apiFailureMessage,
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
  /** Units per case — used by Case Quantity to add a full case in one tap. */
  caseQuantity?: number;
  /** Dollar discount applied to this line (subtracted from line subtotal). */
  discount?: number;
  discountReason?: string;
  /** GST-inclusive rate percent. Defaults to 10. */
  taxPercent?: number;
}

export function lineSubtotal(line: SaleLine): number {
  return line.qty * line.unitPrice;
}

/** Round half-up to cents. Checkout, the cart total, and the till all use this. */
export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

export function lineNetTotal(line: SaleLine): number {
  const sub = lineSubtotal(line);
  if (sub <= 0) return roundMoney(sub);
  return roundMoney(Math.max(0, sub - (line.discount ?? 0)));
}

/** Effective unit price after line discount — display only. Do not multiply it back to a line total. */
export function lineEffectiveUnitPrice(line: SaleLine): number {
  if (line.qty === 0) return line.unitPrice;
  return roundMoney(lineNetTotal(line) / line.qty);
}

export function cartSubtotal(lines: SaleLine[]): number {
  return lines.reduce((n, l) => n + lineSubtotal(l), 0);
}

export function cartDiscountTotal(lines: SaleLine[]): number {
  return lines.reduce((n, l) => n + (l.discount ?? 0), 0);
}

export function cartTotal(lines: SaleLine[]): number {
  const cents = lines.reduce((n, l) => n + Math.round(lineNetTotal(l) * 100), 0);
  return cents / 100;
}

export function lineGst(line: SaleLine): number {
  return includedGst(lineNetTotal(line), line.taxPercent ?? DEFAULT_GST_PERCENT);
}

export function cartGst(lines: SaleLine[]): number {
  return Math.round(lines.reduce((n, line) => n + lineGst(line), 0) * 100) / 100;
}

function parseSellProductId(id: string): string | null {
  return /^\d+$/.test(String(id).trim()) ? String(id).trim() : null;
}

export function toCheckoutItem(line: SaleLine) {
  const productId = parseSellProductId(line.id);
  return {
    productId: productId != null ? Number(productId) : null,
    name: line.name,
    quantity: line.qty,
    unitPrice: line.unitPrice,
    lineTotal: lineNetTotal(line),
  };
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
export type PaymentPhase = "cashout-entry" | "processing" | "approved" | "error";

export function isEftposCashOut(method: PaymentMethod): boolean {
  return method === "Eftpos Cash Out";
}

export function isExactCash(method: PaymentMethod): boolean {
  return method === "Exact Cash";
}

export interface CheckoutResult {
  tendered: number;
  change: number;
  cashout: number;
  invoiceId: string | null;
  paymentMethodName: string | null;
  gst?: number | null;
  rounding?: number | null;
}

export interface PaymentState {
  method: PaymentMethod;
  kind: "card" | "cash";
  amountDue: number;
  tendered: number;
  change: number;
  /** Extra cash given to the customer (Eftpos Cash Out). */
  cashout: number;
  invoiceId: string | null;
  paymentMethodName: string | null;
  gst?: number | null;
  rounding?: number | null;
  phase: PaymentPhase;
  error: string | null;
}

/** Fallback when the backend is offline — matches the live-site demo list. */
export const CUSTOMERS: Customer[] = [
  { id: "aliyah-roberts", name: "Aliyah Roberts", group: "Loyalty Customers", loyaltyPoints: 75 },
  { id: "benjamin-kovacek", name: "Benjamin Kovacek", group: "Loyalty Customers", loyaltyPoints: 1722.5 },
  { id: "billie-nader", name: "Billie Nader", group: "Loyalty Customers", loyaltyPoints: 2 },
  { id: "brandt-willms", name: "Brandt Willms", group: "Loyalty Customers", loyaltyPoints: 4.5 },
];

function toCustomer(hit: SellCustomerHit): Customer {
  return {
    id: hit.id,
    name: hit.name,
    group: hit.groupName ?? "Customers",
    loyaltyPoints: hit.loyaltyPoints,
  };
}

function toLine(p: SellProductHit): SaleLine {
  return {
    id: p.id,
    name: p.name,
    unitPrice: p.price,
    qty: 1,
    caseQuantity: p.caseQuantity > 0 ? p.caseQuantity : undefined,
  };
}

const DEFAULT_CASE_QUANTITY = 24;

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
  saleNote: string;
  noteDialogOpen: boolean;
  discountDialogOpen: boolean;
  pendingResumeId: string | null;
  promotionPeriod: PromotionPeriod;
  promotionFilter: string;
  promotionItems: PromotionBrowseItem[];
  promotionLoading: boolean;
  promotionMenuOpen: boolean;
  productFolder: string;
  productItems: ProductBrowseItem[];
  productLoading: boolean;

  addProduct: (p: {
    id: string;
    name: string;
    unitPrice: number;
    caseQuantity?: number;
  }) => void;
  selectLine: (id: string) => void;
  incQty: (amount?: number) => void;
  decQty: () => void;
  setLineQty: (id: string, qty: number) => void;
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
  confirmCashOut: (cashout: number) => void;
  settlePayment: (result: CheckoutResult) => void;
  failPayment: (message: string) => void;
  retryPayment: () => void;
  completeSale: () => void;
  cancelPayment: () => void;
  setSearchQuery: (q: string) => void;
  /** Customer-only search via GET /api/customers (AI search_customer intent). */
  setCustomerSearchQuery: (q: string) => void;
  /** Product-only search via GET /api/products (AI search_product intent). */
  setProductSearchQuery: (q: string) => void;
  /** Open customer list panel and search via /api/customers. */
  openCustomerSearch: (q?: string) => void;
  setSearchOpen: (open: boolean) => void;
  pickSearchProduct: (p: SellProductHit) => void;
  pickSearchCustomer: (c: SellCustomerHit) => void;
  addQuickKey: (key: string) => void;
  addCatalogProduct: (productId: number) => void;
  applyCaseQuantity: () => void;
  parkCurrentSale: () => void;
  /** Request resume — prompts if the cart already has items. */
  requestResumeParked: (id: string) => void;
  confirmResumeParked: () => void;
  cancelResumeParked: () => void;
  resumeParked: (id: string) => void;
  voidParked: (id: string) => void;
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
  openNoteDialog: () => void;
  closeNoteDialog: () => void;
  saveSaleNote: (note: string) => void;
  returnSelectedItem: () => void;
  openDiscountDialog: () => void;
  closeDiscountDialog: () => void;
  applyLineDiscount: (params: {
    amount?: number;
    percent?: number;
    reason?: string;
  }) => void;
  clearLineDiscount: () => void;
  showProductDetails: () => void;

  itemCount: number;
  productCount: number;
  subtotal: number;
  discountTotal: number;
  total: number;
  gstTotal: number;
  pricesIncludeGst: boolean;
  setPricesIncludeGst: (include: boolean) => void;
}

const SellScreenContext = createContext<SellScreenState | null>(null);

export function SellScreenProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [pricesIncludeGst, setPricesIncludeGst] = useState(true);
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
  const [customers, setCustomers] = useState<Customer[]>(CUSTOMERS);
  const [parkedSales, setParkedSales] = useState<ParkedSale[]>([]);
  const [parkedLoading, setParkedLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saleNote, setSaleNote] = useState("");
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [pendingResumeId, setPendingResumeId] = useState<string | null>(null);
  const [promotionPeriod, setPromotionPeriodState] = useState<PromotionPeriod>("current");
  const [promotionFilter, setPromotionFilterState] = useState("");
  const [promotionItems, setPromotionItems] = useState<PromotionBrowseItem[]>([]);
  const [promotionLoading, setPromotionLoading] = useState(false);
  const [promotionMenuOpen, setPromotionMenuOpen] = useState(false);
  const [productFolder, setProductFolder] = useState("Products");
  const [productItems, setProductItems] = useState<ProductBrowseItem[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const customerSearchRequestRef = useRef(0);
  const promotionRequestRef = useRef(0);
  const productBrowseRequestRef = useRef(0);

  const addProduct = useCallback(
    (p: { id: string; name: string; unitPrice: number; caseQuantity?: number }) => {
      setLines((prev) => {
        const existing = prev.find((l) => l.id === p.id && l.qty > 0);
        if (existing) {
          return prev.map((l) =>
            l.id === p.id && l.qty > 0
              ? {
                  ...l,
                  qty: l.qty + 1,
                  caseQuantity: l.caseQuantity ?? p.caseQuantity,
                }
              : l,
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
      return prev.map((l) => {
        if (l.id !== targetId) return l;
        if (l.qty < 0) return { ...l, qty: l.qty - amount };
        return { ...l, qty: l.qty + amount };
      });
    });
  }, [selectedId]);

  const decQty = useCallback(() => {
    const targetId = selectedId ?? lines[lines.length - 1]?.id;
    const target = targetId ? lines.find((l) => l.id === targetId) : undefined;
    if (target && target.qty > 0 && target.qty <= 1) {
      setPendingAction("− Qty");
      setActionMessage("Keep at least 1 item. Use delete to remove the line.");
      return;
    }
    setLines((prev) => {
      const id = selectedId ?? prev[prev.length - 1]?.id;
      if (!id) return prev;
      const next = prev.flatMap((l) => {
        if (l.id !== id) return [l];
        if (l.qty < 0) {
          const qty = l.qty + 1;
          return qty === 0 ? [] : [{ ...l, qty }];
        }
        if (l.qty <= 1) return [l];
        return [{ ...l, qty: l.qty - 1 }];
      });
      if (!next.some((l) => l.id === id)) {
        setSelectedId((cur) => (cur === id ? null : cur));
      }
      return next;
    });
  }, [selectedId, lines]);

  const setLineQty = useCallback((id: string, qty: number) => {
    if (qty === 0) {
      setLines((prev) => prev.filter((l) => l.id !== id));
      setSelectedId((cur) => (cur === id ? null : cur));
      return;
    }
    const next = Math.round(qty * 100) / 100;
    if (Math.abs(next) < 0.01) return;
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, qty: next } : l)),
    );
    setSelectedId(id);
  }, []);

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
    setSaleNote("");
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
    const amountDue = cartTotal(lines);
    if (amountDue <= 0) {
      setPendingAction("Payment");
      setActionMessage(
        amountDue < 0
          ? "This sale is a refund. Use Finalise Sale to process the return."
          : "Add items to the cart before taking payment.",
      );
      return;
    }
    const kind: PaymentState["kind"] = method === "Exact Cash" ? "cash" : "card";
    setPayment({
      method,
      kind,
      amountDue,
      tendered: amountDue,
      change: 0,
      cashout: 0,
      invoiceId: null,
      paymentMethodName: null,
      phase: isEftposCashOut(method) ? "cashout-entry" : "processing",
      error: null,
    });
  }, [lines]);

  const confirmCashOut = useCallback((cashoutAmount: number) => {
    setPayment((p) => {
      if (!p || !isEftposCashOut(p.method)) return p;
      const cashout = Math.max(0, Math.round(cashoutAmount * 100) / 100);
      return {
        ...p,
        cashout,
        tendered: p.amountDue + cashout,
        phase: "processing",
        error: null,
      };
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
              cashout: result.cashout,
              invoiceId: result.invoiceId,
              paymentMethodName: result.paymentMethodName,
              gst: result.gst,
              rounding: result.rounding,
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
    setSaleNote("");
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

  const setCustomerSearchQuery = useCallback((q: string) => {
    setSearchQueryState(q);
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    searchCustomers(q)
      .then((customers) => setSearchResults({ products: [], customers }))
      .catch(() => setSearchResults({ products: [], customers: [] }));
  }, []);

  const setProductSearchQuery = useCallback((q: string) => {
    setSearchQueryState(q);
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    searchProducts(q)
      .then((products) => setSearchResults({ products, customers: [] }))
      .catch(() => setSearchResults({ products: [], customers: [] }));
  }, []);

  const pickSearchProduct = useCallback(
    (p: SellProductHit) => {
      addProduct(toLine(p));
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

  const addCatalogHit = useCallback(
    (hit: SellProductHit | null, missingMessage: string) => {
      if (!hit || hit.id == null) {
        setPendingAction("Sale Key");
        setActionMessage(missingMessage);
        return;
      }
      const price = Number(hit.price);
      if (!Number.isFinite(price) || price <= 0) {
        setPendingAction("Sale Key");
        setActionMessage(`"${hit.name}" has no catalogue selling price, so it was not added.`);
        return;
      }
      addProduct(toLine({ ...hit, price }));
    },
    [addProduct],
  );

  const addQuickKey = useCallback(
    (key: string) => {
      const label = key.trim();
      if (!label) return;
      quickKeyProduct(label)
        .then((hit) =>
          addCatalogHit(
            hit,
            `"${label}" is not linked to a product. Link it in Sale Keys, or name the key exactly as the product.`,
          ),
        )
        .catch(() => {
          setPendingAction("Sale Key");
          setActionMessage(`Could not look up "${label}". The item was not added.`);
        });
    },
    [addCatalogHit],
  );

  const addCatalogProduct = useCallback(
    (productId: number) => {
      quickKeyProductById(productId)
        .then((hit) =>
          addCatalogHit(hit, "This sale key's product is no longer active, so it was not added."),
        )
        .catch(() => {
          setPendingAction("Sale Key");
          setActionMessage("Could not look up the linked product. The item was not added.");
        });
    },
    [addCatalogHit],
  );

  const applyCaseQuantity = useCallback(() => {
    if (lines.length === 0) return;
    const targetId = selectedId ?? lines[lines.length - 1]?.id;
    if (!targetId) return;

    const line = lines.find((l) => l.id === targetId);
    if (!line || line.qty <= 0) {
      setPendingAction("Case Qty");
      setActionMessage("Case quantity applies to sale items, not returns.");
      return;
    }

    const addCaseQty = (amount: number) => {
      setLines((prev) =>
        prev.map((l) =>
          l.id === targetId
            ? {
                ...l,
                qty: l.qty + amount,
                caseQuantity: l.caseQuantity ?? amount,
              }
            : l,
        ),
      );
    };

    if (line.caseQuantity != null && line.caseQuantity > 0) {
      addCaseQty(line.caseQuantity);
      return;
    }

    sellAction("CASE_QUANTITY", parseSellProductId(targetId))
      .then((res) => addCaseQty(res.caseQuantity ?? DEFAULT_CASE_QUANTITY))
      .catch(() => addCaseQty(DEFAULT_CASE_QUANTITY));
  }, [lines, selectedId]);

  const cartPayload = useCallback(
    () => ({
      customerId: customer?.id ?? null,
      note: saleNote || null,
      items: lines.map(toCheckoutItem),
    }),
    [lines, customer, saleNote],
  );

  const parkCurrentSale = useCallback(() => {
    if (lines.length === 0) return;
    setBusy(true);
    parkSale(cartPayload())
      .then(() => {
        setLines([]);
        setSelectedId(null);
        setCustomer(null);
        setSaleNote("");
        setView("parked");
        setKeypadPage(0);
        return listParkedSales().catch(() => [] as ParkedSale[]);
      })
      .then(setParkedSales)
      .catch((e: unknown) => {
        setPendingAction("Park Sale");
        setActionMessage(
          apiFailureMessage(
            e,
            "Could not park the sale. Sign in and ensure the backend is running.",
            "You must be signed in to park a sale.",
          ),
        );
      })
      .finally(() => setBusy(false));
  }, [lines.length, cartPayload]);

  const resumeParked = useCallback((id: string) => {
    setBusy(true);
    setPendingResumeId(null);
    resumeParkedSale(id)
      .then((sale) => {
        const restored: SaleLine[] = (sale.items ?? []).map((item) => ({
          id: String(item.productId ?? item.id),
          name: item.note ?? "Product",
          unitPrice: Number(item.basePrice),
          qty: Math.max(1, Number(item.quantity)),
        }));
        setLines(restored);
        setSelectedId(restored[0]?.id ?? null);
        setSaleNote(sale.note ?? "");
        if (sale.customerId != null) {
          setCustomer({
            id: String(sale.customerId),
            name: sale.customerName ?? "Customer",
            group: "Customers",
            loyaltyPoints: 0,
          });
        } else {
          setCustomer(null);
        }
        setView("keys");
        setKeypadPage(0);
        return listParkedSales();
      })
      .then(setParkedSales)
      .catch((e: unknown) => {
        setPendingAction("Resume Sale");
        setActionMessage(
          apiFailureMessage(e, "Could not resume the parked sale.", "You must be signed in to resume a sale."),
        );
      })
      .finally(() => setBusy(false));
  }, []);

  const requestResumeParked = useCallback(
    (id: string) => {
      if (lines.length > 0) {
        setPendingResumeId(id);
        return;
      }
      resumeParked(id);
    },
    [lines.length, resumeParked],
  );

  const confirmResumeParked = useCallback(() => {
    if (!pendingResumeId) return;
    const id = pendingResumeId;
    setPendingResumeId(null);
    resumeParked(id);
  }, [pendingResumeId, resumeParked]);

  const cancelResumeParked = useCallback(() => setPendingResumeId(null), []);

  const voidParked = useCallback((id: string) => {
    setBusy(true);
    voidParkedSale(id)
      .then(() => listParkedSales().catch(() => [] as ParkedSale[]))
      .then(setParkedSales)
      .catch((e: unknown) => {
        setPendingAction("Discard Sale");
        setActionMessage(
          apiFailureMessage(e, "Could not discard the parked sale.", "You must be signed in to discard a sale."),
        );
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

  const openNoteDialog = useCallback(() => setNoteDialogOpen(true), []);
  const closeNoteDialog = useCallback(() => setNoteDialogOpen(false), []);
  const saveSaleNote = useCallback((note: string) => {
    setSaleNote(note.trim());
    setNoteDialogOpen(false);
    setPendingAction("Add Note");
    setActionMessage(note.trim() ? "Sale note saved." : "Sale note cleared.");
  }, []);

  const returnSelectedItem = useCallback(() => {
    const targetId = selectedId ?? lines[lines.length - 1]?.id;
    if (!targetId) {
      setPendingAction("Return Item");
      setActionMessage("Select a cart line first, then tap Return Item.");
      return;
    }
    const line = lines.find((l) => l.id === targetId);
    if (!line) return;
    if (line.qty < 0) {
      setPendingAction("Return Item");
      setActionMessage(`"${line.name}" is already marked as a return.`);
      return;
    }
    const returnQty = -Math.abs(line.qty);
    setLines((prev) =>
      prev.map((l) =>
        l.id === targetId
          ? { ...l, qty: returnQty, discount: undefined, discountReason: undefined }
          : l,
      ),
    );
    setPendingAction("Return Item");
    setActionMessage(`"${line.name}" marked as return (${returnQty}).`);
  }, [selectedId, lines]);

  const openDiscountDialog = useCallback(() => {
    const targetId = selectedId ?? lines[lines.length - 1]?.id;
    if (!targetId || lines.length === 0) {
      setPendingAction("Discount");
      setActionMessage("Add and select a cart line first.");
      return;
    }
    const line = lines.find((l) => l.id === targetId);
    if (!line || line.qty <= 0) {
      setPendingAction("Discount");
      setActionMessage("Discounts apply to sale items, not returns.");
      return;
    }
    setDiscountDialogOpen(true);
  }, [selectedId, lines]);

  const closeDiscountDialog = useCallback(() => setDiscountDialogOpen(false), []);

  const applyLineDiscount = useCallback(
    (params: { amount?: number; percent?: number; reason?: string }) => {
      const targetId = selectedId ?? lines[lines.length - 1]?.id;
      if (!targetId) return;
      const line = lines.find((l) => l.id === targetId);
      if (!line || line.qty <= 0) {
        closeDiscountDialog();
        return;
      }

      const subtotal = lineSubtotal(line);
      let discount = 0;
      if (params.percent != null && params.percent > 0) {
        discount = Math.round(subtotal * (params.percent / 100) * 100) / 100;
      } else if (params.amount != null && params.amount > 0) {
        discount = Math.min(subtotal, Math.round(params.amount * 100) / 100);
      }

      setLines((prev) =>
        prev.map((l) =>
          l.id === targetId
            ? {
                ...l,
                discount: discount > 0 ? discount : undefined,
                discountReason: params.reason?.trim() || undefined,
              }
            : l,
        ),
      );
      closeDiscountDialog();
      setPendingAction("Discount");
      setActionMessage(
        discount > 0
          ? `$${discount.toFixed(2)} discount applied to "${line.name}".`
          : `Discount cleared for "${line.name}".`,
      );
    },
    [selectedId, lines, closeDiscountDialog],
  );

  const clearLineDiscount = useCallback(() => {
    const targetId = selectedId ?? lines[lines.length - 1]?.id;
    if (!targetId) return;
    setLines((prev) =>
      prev.map((l) =>
        l.id === targetId
          ? { ...l, discount: undefined, discountReason: undefined }
          : l,
      ),
    );
  }, [selectedId, lines]);

  const showProductDetails = useCallback(() => {
    const targetId = selectedId ?? lines[lines.length - 1]?.id;
    const line = targetId ? lines.find((l) => l.id === targetId) : null;
    setPendingAction("Product Details");
    if (!line) {
      setActionMessage("Select a cart line to view product details.");
      return;
    }
    setActionMessage(
      `${line.name}\nUnit price: $${line.unitPrice.toFixed(2)}\nQuantity: ${line.qty}\nLine total: $${lineNetTotal(line).toFixed(2)}${
        line.discount ? `\nDiscount: $${line.discount.toFixed(2)}` : ""
      }`,
    );
  }, [selectedId, lines]);

  const loadCustomers = useCallback((q?: string) => {
    const term = q?.trim() ?? "";
    const requestId = ++customerSearchRequestRef.current;
    searchCustomers(term)
      .then((hits) => {
        if (requestId !== customerSearchRequestRef.current) return;
        if (hits.length > 0) {
          setCustomers(hits.map(toCustomer));
        } else if (!term) {
          setCustomers(CUSTOMERS);
        } else {
          setCustomers([]);
        }
      })
      .catch(() => {
        if (requestId !== customerSearchRequestRef.current) return;
        if (!term) setCustomers(CUSTOMERS);
        else setCustomers([]);
      });
  }, []);

  /** Open sell customer list overlay, optionally pre-filtered (AI search_customer). */
  const openCustomerSearch = useCallback((q?: string) => {
    const term = q?.trim() ?? "";
    const requestId = ++customerSearchRequestRef.current;
    setSearchQueryState(term);
    setView("customers");
    searchCustomers(term)
      .then((hits) => {
        if (requestId !== customerSearchRequestRef.current) return;
        setCustomers(hits.map(toCustomer));
        setSearchResults({ products: [], customers: hits });
      })
      .catch(() => {
        if (requestId !== customerSearchRequestRef.current) return;
        setCustomers(term ? [] : CUSTOMERS);
        setSearchResults({ products: [], customers: [] });
      });
  }, []);

  const loadPromotionBrowse = useCallback((period: PromotionPeriod, q: string) => {
    const requestId = ++promotionRequestRef.current;
    setPromotionLoading(true);
    browsePromotions(period, q || undefined)
      .then((res) => {
        if (requestId === promotionRequestRef.current) setPromotionItems(res.items);
      })
      .catch(() => {
        if (requestId === promotionRequestRef.current) setPromotionItems([]);
      })
      .finally(() => {
        if (requestId === promotionRequestRef.current) setPromotionLoading(false);
      });
  }, []);

  const loadProductBrowse = useCallback((folder: string, q?: string) => {
    const requestId = ++productBrowseRequestRef.current;
    setProductLoading(true);
    const category = folder === "Products" ? undefined : folder;
    browseProducts(category, q)
      .then((res) => {
        if (requestId !== productBrowseRequestRef.current) return;
        setProductItems(res.items);
        setProductFolder(res.folderName);
      })
      .catch(() => {
        if (requestId === productBrowseRequestRef.current) setProductItems([]);
      })
      .finally(() => {
        if (requestId === productBrowseRequestRef.current) setProductLoading(false);
      });
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
      addProduct({
        id: item.id,
        name: item.name,
        unitPrice: item.price,
        caseQuantity:
          item.caseQuantity != null && item.caseQuantity > 0
            ? item.caseQuantity
            : undefined,
      });
      backToKeys();
    },
    [addProduct, backToKeys],
  );

  useEffect(() => {
    if (view === "parked") refreshParked();
  }, [view, refreshParked]);

  // Keep parked count available for the tab badge.
  useEffect(() => {
    refreshParked();
  }, [refreshParked]);

  useEffect(() => {
    if (view === "customers") {
      loadCustomers(searchQuery.trim() || undefined);
    }
    // Only when opening the customers view; typing uses CustomerPanel → loadCustomers directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const { itemCount, productCount, subtotal, discountTotal, total, gstTotal } = useMemo(() => {
    const items = lines.reduce((n, l) => n + Math.abs(l.qty), 0);
    return {
      itemCount: items,
      productCount: lines.length,
      subtotal: cartSubtotal(lines),
      discountTotal: cartDiscountTotal(lines),
      total: cartTotal(lines),
      gstTotal: cartGst(lines),
    };
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
    saleNote,
    noteDialogOpen,
    discountDialogOpen,
    pendingResumeId,
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
    setLineQty,
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
    confirmCashOut,
    settlePayment,
    failPayment,
    retryPayment,
    completeSale,
    cancelPayment,
    setSearchQuery,
    setCustomerSearchQuery,
    setProductSearchQuery,
    openCustomerSearch,
    setSearchOpen,
    pickSearchProduct,
    pickSearchCustomer,
    addQuickKey,
    addCatalogProduct,
    applyCaseQuantity,
    parkCurrentSale,
    requestResumeParked,
    confirmResumeParked,
    cancelResumeParked,
    resumeParked,
    voidParked,
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
    openNoteDialog,
    closeNoteDialog,
    saveSaleNote,
    returnSelectedItem,
    openDiscountDialog,
    closeDiscountDialog,
    applyLineDiscount,
    clearLineDiscount,
    showProductDetails,
    itemCount,
    productCount,
    subtotal,
    discountTotal,
    total,
    gstTotal,
    pricesIncludeGst,
    setPricesIncludeGst,
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

/** Returns null outside SellScreenProvider — for AI float on admin pages. */
export function useOptionalSellScreen() {
  return useContext(SellScreenContext);
}

export function splitMoney(value: number): { whole: string; cents: string } {
  const fixed = value.toFixed(2);
  const [whole, cents] = fixed.split(".");
  return { whole, cents };
}
