"use client";

import { formatPurchaseQuantity, positivePurchaseLines } from "@/lib/purchase-quantity";
import { draftSupplierId } from "@/lib/purchase-draft-policy";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarRange,
  Check,
  CircleHelp,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  X,
} from "lucide-react";
import { createRetailDraftRfq, getRetailSuppliers, type RetailDraftRfq, type RetailSupplierOption } from "@/lib/retail-api";
import { appendReplenishmentAudit, readReplenishmentAudit, type ReplenishmentAuditEntry } from "@/lib/replenishment-audit";
import { formatStoreDateTime, formatStoreEpoch } from "@/lib/retail-date";
import {
  friendlyProductName,
  truncateSku,
} from "@/lib/product-display-name";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useAuth } from "@/lib/auth";
import type { InventoryHistoryStatus } from "@/types/inventory-history";
import type { ForecastBusinessCost } from "@/lib/forecast-business-cost";
import { forecastReadiness } from "@/lib/forecast-readiness";

type ReplenishmentProduct = {
  id: number;
  name: string;
  sku: string;
  unit: string;
  soldUnits: number;
  recentUnits: number;
  previousUnits: number;
  unitsPerDay: number;
  trendPercent: number | null;
  trend: "new" | "up" | "down" | "steady" | null;
  onHand: number;
  onOrder?: number;
  caseQuantity?: number | null;
  supplierId?: number | null;
  supplierName?: string | null;
  forecastStock: number;
  daysOfStock: number | null;
  daysOfStockAfterReplenishment?: number | null;
  leadTimeDays?: number | null;
  risk?: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  attentionLevel?: "REVIEW" | "HIGH" | "MEDIUM" | "LOW";
  attentionScore?: number;
  attentionReasons?: string[];
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  dataQuality?: string;
  recommendationStatus?: "REVIEW_DATA" | "NO_DEMAND" | "READY";
  dataIssues?: string[];
  suggestedQuantity: number;
  reason?: string;
  reasonParts?: string[];
  method?: string;
  modelVersion?: string | null;
  forecastQuality?: string;
  forecastConfidence?: string;
  selectionStatus?: string | null;
  selectionMetric?: string | null;
  candidateScores?: Record<string, number>;
  candidateBusinessCosts?: Record<string, ForecastBusinessCost>;
  selectionValidation?: Record<string, string | number>;
  analogCount?: number;
  p50?: number | null;
  p80?: number | null;
  p90?: number | null;
  expectedStockoutDaysAfterReplenishment?: number | null;
  stockoutDemandUnitsAfterReplenishment?: number | null;
  unitCost?: number | null;
  unitPrice?: number | null;
  inventoryValue?: number | null;
  suggestedOrderValue?: number | null;
  stockoutRevenueAtRisk?: number | null;
};

type ReplenishmentData = {
  company: string;
  historyDays: number;
  periodDays: number;
  coverageDays: number;
  products: ReplenishmentProduct[];
  exceptionMode?: boolean;
  exceptionCount?: number;
  truncated: boolean;
  catalogueCoverage?: { status: string; loadedProducts: number; eligibleProducts: number; forecastedProducts: number };
  salesHistory?: {
    timezone: string;
    timezoneVerified: boolean;
    startDate?: string;
    endDateExclusive?: string;
    completeDaysOnly?: boolean;
    refunds?: string;
  };
  reviewRequiredCount?: number;
  reviewIssueCounts?: Record<string, number>;
  excludedProductCount?: number;
  productEligibility?: string;
  generatedAt: string;
  cache?: { status?: "HIT" | "MISS"; expiresAt?: string };
  inventoryHistory?: InventoryHistoryStatus;
  dataQuality?: string;
  forecast?: {
    enabled: boolean;
    modelSelection: string;
    modelVersion?: string | null;
    sourceVersion?: string | null;
    status: string;
    costPolicy?: { annualHoldingRate: number; annualObsolescenceRate: number; serviceLevel: number } | null;
  };
  businessMetrics?: {
    inventoryValue: number | null;
    suggestedOrderValue: number | null;
    stockoutRevenueAtRisk: number | null;
    productsWithExpectedStockout: number;
    expectedStockoutDaysAfterReplenishment: number | null;
    dataQuality: string;
  };
  purchaseWorkflow?: {
    draftEnabled: boolean;
    mode: "DRAFT_RFQ" | "READ_ONLY_PREVIEW";
  };
};

type ListFilter = "suggestions" | "urgent" | "out_of_stock" | "review" | "missing_data" | "slow_stock" | "all";

const coverageOptions = [7, 14, 21, 28, 42];
const number = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });
const MAX_RFQ_LINES = 100;
const MAX_RFQ_QUANTITY = 100_000;
const REPLENISHMENT_CACHE_PREFIX = "orithos-replenishment-cache-v3:";
const REPLENISHMENT_CACHE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

function compareRfqPriority(a: ReplenishmentProduct, b: ReplenishmentProduct) {
  const riskOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, UNKNOWN: 3 };
  const ar = riskOrder[a.risk ?? "UNKNOWN"] ?? 4;
  const br = riskOrder[b.risk ?? "UNKNOWN"] ?? 4;
  if (ar !== br) return ar - br;
  if (b.suggestedQuantity !== a.suggestedQuantity) return b.suggestedQuantity - a.suggestedQuantity;
  return a.id - b.id;
}

function isRfqReady(product: ReplenishmentProduct) {
  return product.supplierId != null && product.suggestedQuantity > 0 && product.recommendationStatus === "READY";
}

function riskLabel(risk: ReplenishmentProduct["risk"]) {
  const labels = { LOW: "Low risk", MEDIUM: "Review", HIGH: "High risk", UNKNOWN: "Unknown risk" };
  return risk ? labels[risk] : "Risk unavailable";
}

function ForecastSelectionExplanation({ product }: { product: ReplenishmentProduct }) {
  const cost = product.method ? product.candidateBusinessCosts?.[product.method] : undefined;
  if (product.selectionStatus === "ANALOG_COLD_START") return <p className="text-xs">Similar-product estimate from {product.analogCount ?? 0} comparables · low confidence. Check category, brand and price band before ordering.</p>;
  if (!cost) return product.selectionMetric === "rolling_wape" ? <p className="text-xs">Selection uses forecast error because comparable cost inputs are unavailable.</p> : null;
  const money = (value: number) => value.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <div className="space-y-1 text-xs">
    <p className="font-semibold">{product.selectionValidation?.status === "COST_VALIDATED" ? "Cost selection passed three recent validation cycles." : "WAPE baseline retained: cost selection has not passed three separate recent validation cycles."}</p>
    <p className="font-semibold">Simulated planning cost: {money(cost.totalCostPerDay)} / day · demand fulfilled {number.format(cost.fillRate * 100)}%</p>
    <p>Lost margin {money(cost.lostMarginPerDay)} · holding {money(cost.holdingCostPerDay)} · slow-stock risk {money(cost.obsolescenceCostPerDay)} · service penalty {money(cost.servicePenaltyPerDay)} per day.</p>
    <p>{cost.evaluatedFolds} evaluation cycles, {cost.evaluatedDays} observed days. Comparison assumes an immediate delivery and zero opening stock each cycle; check actual stock, supplier delivery times and cost assumptions before ordering.</p>
  </div>;
}

function riskClass(risk: ReplenishmentProduct["risk"]) {
  return risk === "HIGH" ? "bg-red-50 text-red-800" : risk === "MEDIUM" ? "bg-amber-50 text-amber-800" : risk === "LOW" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700";
}

function attentionClass(level: ReplenishmentProduct["attentionLevel"]) {
  return level === "REVIEW" ? "bg-amber-100 text-amber-900" : level === "HIGH" ? "bg-red-100 text-red-900" : level === "MEDIUM" ? "bg-sky-50 text-sky-800" : "bg-slate-100 text-slate-700";
}

function attentionLabel(level: ReplenishmentProduct["attentionLevel"]) {
  return level === "REVIEW" ? "Data review" : level === "HIGH" ? "Act now" : level === "MEDIUM" ? "Watch" : "Monitor";
}

type DraftRfqLine = { productId: number; name: string; unit: string; suggestedQuantity: number; quantity: number; reason: string; adjustmentReason: string };

function approvalReason(line: DraftRfqLine) {
  return line.adjustmentReason.trim() ? `Reviewer quantity adjustment: ${line.adjustmentReason.trim()}. Forecast rationale: ${line.reason}` : line.reason;
}

function trendLabel(product: ReplenishmentProduct, periodDays: number) {
  if (product.trend === "new") return <span className="rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">New demand</span>;
  if (product.trend === "up") return <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">↑ {number.format(product.trendPercent ?? 0)}%</span>;
  if (product.trend === "down") return <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">↓ {number.format(Math.abs(product.trendPercent ?? 0))}%</span>;
  if (product.trend === "steady") return <span className="text-sm text-[var(--oh-text-secondary)]">Steady</span>;
  return <span className="text-sm text-[var(--oh-muted)]" title={`Trend · ${periodDays}d`}>—</span>;
}

export function OdooReplenishmentPage({ embedded = false }: { embedded?: boolean }) {
  const Container = embedded ? "section" : "main";
  const { user, ready: authReady } = useAuth();
  const [data, setData] = useState<ReplenishmentData | null>(null);
  const [coverageDays, setCoverageDays] = useState(21);
  const [exceptionOnly, setExceptionOnly] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("suggestions");
  const [query, setQuery] = useState("");
  const [showMoreColumns, setShowMoreColumns] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ key: "", page: 1 });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [rfqOpen, setRfqOpen] = useState(false);
  const [rfqLoadingSuppliers, setRfqLoadingSuppliers] = useState(false);
  const [rfqSubmitting, setRfqSubmitting] = useState(false);
  const [rfqSuppliers, setRfqSuppliers] = useState<RetailSupplierOption[]>([]);
  const [rfqSupplierId, setRfqSupplierId] = useState("");
  const [rfqSupplierError, setRfqSupplierError] = useState<string | null>(null);
  const [rfqLines, setRfqLines] = useState<DraftRfqLine[]>([]);
  const [rfqError, setRfqError] = useState<string | null>(null);
  const [createdRfq, setCreatedRfq] = useState<RetailDraftRfq | null>(null);
  const [auditEntries, setAuditEntries] = useState<ReplenishmentAuditEntry[]>([]);
  const [expandedReasonId, setExpandedReasonId] = useState<number | null>(null);
  const [storeTimezone, setStoreTimezone] = useState("Australia/Adelaide");
  const requestRevision = useRef(0);
  const autoRefreshGeneration = useRef<string | null>(null);
  const rfqSupplierRevision = useRef(0);
  const rfqInFlight = useRef(false);
  const rfqRequestId = useRef("");
  const rfqSupplierRef = useRef<HTMLSelectElement>(null);
  const methodCloseRef = useRef<HTMLButtonElement>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);

  useDialogFocus(rfqOpen, () => {
    if (!rfqSubmitting) setRfqOpen(false);
  }, rfqLoadingSuppliers ? "rfq-loading" : "rfq-ready", rfqSupplierRef);

  useDialogFocus(methodOpen, () => setMethodOpen(false), "method-help", methodCloseRef, helpButtonRef);

  const browserIdentity = user ? [user.id, user.vendorId ?? "", user.outletId ?? "", user.roleCode ?? "", user.isAdmin ? "admin" : "staff", [...(user.permissions ?? [])].sort().join(",")].join(":") : "anonymous";
  const cacheKey = `${REPLENISHMENT_CACHE_PREFIX}${typeof window === "undefined" ? "server" : window.location.host}:${browserIdentity}:${coverageDays}:${exceptionOnly ? "exceptions" : "all"}`;
  const previousBrowserIdentity = useRef(browserIdentity);

  useEffect(() => {
    if (previousBrowserIdentity.current === browserIdentity) return;
    previousBrowserIdentity.current = browserIdentity;
    autoRefreshGeneration.current = null;
    setData(null);
    setSupplierFilter("");
    setSelectedIds(new Set());
    setLoading(true);
  }, [browserIdentity]);

  useEffect(() => {
    setAuditEntries(readReplenishmentAudit());
  }, []);

  // Hydrate the last successful plan immediately. Odoo can then refresh in the
  // background without ever replacing a usable screen with an error state.
  useEffect(() => {
    if (!authReady || !user) return;
    try {
      const raw = window.localStorage.getItem(cacheKey);
      if (!raw) return;
      const cached = JSON.parse(raw) as { savedAt?: number; data?: ReplenishmentData };
      if (!cached.data || !Array.isArray(cached.data.products)) return;
      const generatedAt = Date.parse(cached.data.generatedAt);
      if (!Number.isFinite(generatedAt) || Date.now() - generatedAt > REPLENISHMENT_CACHE_MAX_AGE_MS) return;
      setData(cached.data);
      setSelectedIds(new Set());
      setLoading(false);
    } catch { /* Ignore malformed browser cache and fetch a fresh plan. */ }
  }, [authReady, cacheKey, user]);

  const load = useCallback(async (refresh = false) => {
    const revision = ++requestRevision.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120_000);
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ coverageDays: String(coverageDays) });
      if (exceptionOnly) params.set("mode", "exceptions");
      if (refresh) params.set("refresh", "true");
      const response = await fetch(`/api/replenishment/plan?${params}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const body = await response.json().catch(() => null) as { code?: number; data?: ReplenishmentData; message?: string } | null;
      if (revision !== requestRevision.current) return;
      if (!response.ok || body?.code !== 0 || !body?.data) {
        setNeedsConnection(response.status === 401);
        throw new Error(body?.message || `Could not load the replenishment plan (${response.status}).`);
      }
      const payload = body.data;
      setNeedsConnection(false);
      setData(payload);
      setStoreTimezone(payload.salesHistory?.timezone ?? "Australia/Adelaide");
      try { window.localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data: payload })); } catch { /* Storage is optional. */ }
      setSelectedIds(new Set());
    } catch (cause) {
      if (revision === requestRevision.current) {
      setError(cause instanceof DOMException && cause.name === "AbortError"
        ? "The replenishment plan is taking too long to calculate. Retry in a moment."
        : cause instanceof Error ? cause.message : "Could not load the replenishment plan.");
      }
    } finally {
      if (revision === requestRevision.current) {
        setLoading(false);
        setRefreshing(false);
      }
      window.clearTimeout(timeout);
    }
  }, [cacheKey, coverageDays, exceptionOnly]);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setData(null);
      setLoading(false);
      return;
    }
    void load();
  }, [authReady, load, user]);

  useEffect(() => {
    if (!data || loading || refreshing || error || data.cache?.status !== "HIT") return;
    const generatedAt = Date.parse(data.generatedAt);
    if (!Number.isFinite(generatedAt) || Date.now() - generatedAt < 20 * 60 * 60 * 1000) return;
    if (autoRefreshGeneration.current === data.generatedAt) return;
    autoRefreshGeneration.current = data.generatedAt;
    void load(true);
  }, [data, error, load, loading, refreshing]);

  const orderReadyItems = useMemo(
    () => (data?.products ?? []).filter((product) => product.suggestedQuantity > 0 && product.recommendationStatus === "READY"),
    [data],
  );
  const suggestedItems = useMemo(
    () => (data?.products ?? []).filter((product) => product.suggestedQuantity > 0) ?? [],
    [data],
  );
  const totalOrderReadyUnits = orderReadyItems.reduce((sum, product) => sum + product.suggestedQuantity, 0);
  const totalSuggestedUnits = suggestedItems.reduce((sum, product) => sum + product.suggestedQuantity, 0);
  const outOfStockWithDemand = (data?.products ?? []).filter((product) => product.onHand <= 0 && product.soldUnits > 0).length;
  const urgentRiskCount = (data?.products ?? []).filter((product) => product.risk === "HIGH" || (product.onHand <= 0 && product.soldUnits > 0)).length;
  const forecastReadinessSummary = useMemo(() => forecastReadiness(data?.products ?? []), [data?.products]);
  const missingDataCount = (data?.products ?? []).filter((product) =>
    !(typeof product.unitCost === "number" && Number.isFinite(product.unitCost) && product.unitCost > 0)
    || !(typeof product.leadTimeDays === "number" && Number.isFinite(product.leadTimeDays) && product.leadTimeDays > 0),
  ).length;
  const hasRecentSales = data?.products.some((product) => product.soldUnits > 0) ?? false;

  const supplierGroups = useMemo(() => {
    const groups = new Map<number, string>();
    for (const product of data?.products ?? []) {
      if (product.supplierId != null && product.supplierName) groups.set(product.supplierId, product.supplierName);
    }
    return [...groups.entries()].sort((left, right) => left[1].localeCompare(right[1], "en-AU"));
  }, [data]);

  const filteredItems = useMemo(() => {
    const products = data?.products ?? [];
    const base = supplierFilter
      ? products.filter((product) => String(product.supplierId) === supplierFilter)
      : products;
    const byFilter = listFilter === "suggestions"
      ? base.filter((product) => product.suggestedQuantity > 0 && product.recommendationStatus === "READY")
      : listFilter === "urgent"
        ? base.filter((product) => product.risk === "HIGH" || (product.onHand <= 0 && product.soldUnits > 0))
      : listFilter === "review" ? base.filter((product) => product.recommendationStatus === "REVIEW_DATA")
      : listFilter === "missing_data" ? base.filter((product) =>
        !(typeof product.unitCost === "number" && Number.isFinite(product.unitCost) && product.unitCost > 0)
        || !(typeof product.leadTimeDays === "number" && Number.isFinite(product.leadTimeDays) && product.leadTimeDays > 0),
      )
      : listFilter === "out_of_stock"
        ? base.filter((product) => product.onHand <= 0 && product.soldUnits > 0)
        : listFilter === "slow_stock"
          ? base.filter((product) => product.onHand > 0 && (product.soldUnits <= 0 || (typeof product.daysOfStock === "number" && product.daysOfStock >= coverageDays * 2)))
        : base;
    const normalized = query.trim().toLowerCase();
    if (!normalized) return byFilter;
    return byFilter.filter((product) => {
      const label = friendlyProductName(product.name).toLowerCase();
      return label.includes(normalized)
        || product.name.toLowerCase().includes(normalized)
        || product.sku.toLowerCase().includes(normalized);
    });
  }, [data, listFilter, query, supplierFilter, coverageDays]);

  const pageKey = `${data?.generatedAt ?? ""}|${listFilter}|${supplierFilter}|${query}`;
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / 100));
  const currentPage = pagination.key === pageKey ? Math.min(pagination.page, pageCount) : 1;
  const pageItems = useMemo(() => filteredItems.slice((currentPage - 1) * 100, currentPage * 100), [filteredItems, currentPage]);

  const selectedSuggested = useMemo(
    () => orderReadyItems.filter((product) => selectedIds.has(product.id)),
    [orderReadyItems, selectedIds],
  );
  const rfqLineCount = Math.min(selectedSuggested.length, MAX_RFQ_LINES);
  const rfqSelectionTrimmed = selectedSuggested.length > MAX_RFQ_LINES;
  const selectedRfqLines = positivePurchaseLines(rfqLines);
  const planCoverageDays = data?.coverageDays ?? coverageDays;
  const planReady = Boolean(data) && !loading && !refreshing && !error && data?.coverageDays === coverageDays;
  const draftRfqEnabled = data?.purchaseWorkflow?.draftEnabled === true;
  const selectedSupplierId = draftSupplierId(selectedSuggested);
  const canCreateRfq = draftRfqEnabled && planReady && selectedSupplierId != null;

  const visibleSelectableIds = useMemo(
    () => pageItems.filter(isRfqReady).map((product) => product.id),
    [pageItems],
  );
  const allVisibleSelected = visibleSelectableIds.length > 0 && visibleSelectableIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleSelectableIds.some((id) => selectedIds.has(id));

  function orderReadySelectedCount(ids: Set<number>) {
    return orderReadyItems.filter((product) => ids.has(product.id)).length;
  }

  function toggleSelectAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const id of visibleSelectableIds) next.delete(id);
        return next;
      }
      let slots = MAX_RFQ_LINES - orderReadySelectedCount(current);
      for (const id of visibleSelectableIds) {
        if (slots <= 0) break;
        if (!next.has(id)) {
          next.add(id);
          slots -= 1;
        }
      }
      return next;
    });
  }

  function toggleSelectProduct(productId: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
        return next;
      }
      const product = data?.products.find((item) => item.id === productId);
      if (product && isRfqReady(product) && orderReadySelectedCount(current) >= MAX_RFQ_LINES) return current;
      next.add(productId);
      return next;
    });
  }

  function openRfqDialog() {
    if (!canCreateRfq || selectedSupplierId == null) return;
    rfqRequestId.current = crypto.randomUUID();
    const lines = [...selectedSuggested].sort(compareRfqPriority).slice(0, MAX_RFQ_LINES).map((product) => ({
      productId: product.id,
      name: friendlyProductName(product.name),
      unit: product.unit,
      suggestedQuantity: product.suggestedQuantity,
      quantity: product.suggestedQuantity,
      reason: product.reason || product.reasonParts?.join(" ") || "",
      adjustmentReason: "",
    }));
    setRfqLines(lines);
    setRfqSupplierId("");
    setRfqError(null);
    setCreatedRfq(null);
    setRfqOpen(true);
    void loadRfqSuppliers(selectedSupplierId);
  }

  async function loadRfqSuppliers(supplierId: number) {
    const revision = ++rfqSupplierRevision.current;
    setRfqLoadingSuppliers(true);
    setRfqSupplierError(null);
    setRfqSuppliers([]);
    setRfqSupplierId("");
    try {
      const suppliers = await getRetailSuppliers();
      if (revision !== rfqSupplierRevision.current) return;
      const matched = suppliers.filter((supplier) => supplier.id === supplierId);
      setRfqSuppliers(matched);
      if (matched.length) setRfqSupplierId(String(supplierId));
      else setRfqSupplierError("The mapped supplier is unavailable in the current store.");
    } catch (cause) {
      if (revision === rfqSupplierRevision.current) {
        setRfqSupplierError(cause instanceof Error ? cause.message : "Could not load Orithos suppliers.");
      }
    } finally {
      if (revision === rfqSupplierRevision.current) setRfqLoadingSuppliers(false);
    }
  }

  async function submitRfq(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rfqInFlight.current) return;
    const supplierId = Number(rfqSupplierId);
    if (!Number.isSafeInteger(supplierId) || supplierId < 1 || supplierId !== selectedSupplierId) {
      setRfqError("Choose a supplier for this draft RFQ.");
      return;
    }
    if (!selectedRfqLines.length) {
      setRfqError("Keep at least one product with a quantity above zero.");
      return;
    }
    if (rfqLines.some((line) => !Number.isFinite(line.quantity) || line.quantity < 0 || line.quantity > MAX_RFQ_QUANTITY)) {
      setRfqError(`Enter quantities from 0 to ${MAX_RFQ_QUANTITY.toLocaleString("en-AU")} for every product.`);
      return;
    }
    if (rfqLines.some((line) => line.quantity !== line.suggestedQuantity && !line.adjustmentReason.trim())) {
      setRfqError("Explain each quantity change so the approval audit records your decision.");
      return;
    }
    rfqInFlight.current = true;
    setRfqSubmitting(true);
    setRfqError(null);
    try {
      const result = await createRetailDraftRfq({
        requestId: rfqRequestId.current,
        supplierId,
        coverageDays,
        method: data?.forecast?.modelSelection ?? "rules_v1_weighted_velocity",
        lines: selectedRfqLines.map((line) => ({ productId: line.productId, quantity: line.quantity, suggestedQuantity: line.suggestedQuantity, reason: approvalReason(line) })),
      });
      const supplier = rfqSuppliers.find((item) => item.id === supplierId);
      let displayResult = result;
      try {
        const audit = appendReplenishmentAudit({
          company: data?.company ?? "Current company",
          coverageDays,
          method: data?.forecast?.modelSelection ?? "rules_v1_weighted_velocity",
          supplierId,
          supplierName: supplier?.name ?? result.supplier,
          rfqName: result.name,
          rfqUrl: result.url,
          lines: rfqLines.map((line) => ({
            productId: line.productId,
            name: line.name,
            suggestedQuantity: line.suggestedQuantity,
            orderedQuantity: line.quantity,
            reason: approvalReason(line),
          })),
        });
        setAuditEntries((current) => [audit, ...current].slice(0, 40));
      } catch {
        displayResult = { ...result, warning: [result.warning, "Browser history could not be saved. Check this draft in Orithos before starting another review."].filter(Boolean).join(" ") };
      }
      setCreatedRfq(displayResult);
      setRfqOpen(false);
    } catch (cause) {
      setRfqError(cause instanceof Error ? cause.message : "Could not create the draft RFQ.");
    } finally {
      rfqInFlight.current = false;
      setRfqSubmitting(false);
    }
  }

  const tableColSpan = (showMoreColumns ? 9 : 5) + 1;

  if (loading && !data) return <ReplenishmentSkeleton />;

  if (needsConnection && !data) return (
    <Container className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
      <section className="max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
        <Store className="mx-auto text-amber-600" size={30} />
        <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Connect Orithos to plan replenishment</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">This view uses Orithos POS sales and on-hand stock for your current company.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2"><button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><RefreshCw size={16} /> Retry</button><Link href="/settings/integrations" className="inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Connect Orithos</Link></div>
      </section>
    </Container>
  );

  if (error && !data) return (
    <Container className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
      <section role="alert" className="w-full max-w-lg rounded-xl border border-red-200 bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
        <AlertCircle className="mx-auto text-red-700" size={30} />
        <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Could not load replenishment</h1>
        <p className="mt-2 text-sm leading-6 text-red-800">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><RefreshCw size={16} /> Retry</button>
      </section>
    </Container>
  );

  return (
    <Container className={`relative flex h-full min-h-0 flex-col overflow-y-auto ${embedded ? "gap-3 p-3 md:p-4" : "gap-4 p-4 md:gap-5 md:p-6"}`}>
      <header className={`flex flex-wrap items-start justify-between gap-3 ${embedded ? "rounded-lg border border-[var(--oh-border)] bg-white px-3 py-3 shadow-[var(--oh-shadow-card)] md:px-4" : ""}`}>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Stock planning · {data?.company}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {!embedded && <h1 className="text-2xl font-semibold tracking-tight text-[var(--oh-text)]">Replenishment</h1>}
            <button
              ref={helpButtonRef}
              type="button"
              onClick={() => setMethodOpen(true)}
              aria-label="How this estimate works"
              className="grid h-8 w-8 place-items-center rounded-md text-[var(--oh-muted)] outline-none hover:bg-[var(--oh-paper)] hover:text-[var(--oh-text)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
            >
              <CircleHelp size={17} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--oh-muted)]">
            <span>{planCoverageDays}-day coverage</span>
            {data?.generatedAt ? <span>· Updated {formatStoreDateTime(data.generatedAt, storeTimezone)}</span> : null}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${data?.inventoryHistory?.status === "FRESH" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
              Inventory {data?.inventoryHistory?.status === "FRESH" ? "OK" : "check"}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${draftRfqEnabled ? "bg-sky-50 text-sky-800" : "bg-slate-100 text-slate-700"}`}>{draftRfqEnabled ? "Draft RFQ" : "Preview"}</span>
          </p>
          {data?.forecast?.enabled && data?.forecast?.status === "AVAILABLE" && (
            <details className="mt-1 text-xs text-[var(--oh-muted)]">
              <summary className="cursor-pointer font-medium text-[var(--oh-text-secondary)] hover:text-[var(--oh-text)]">Forecast inputs & assumptions</summary>
              <div className="mt-2 space-y-1 leading-5">
                <p>Forecast {data.forecast.status.toLowerCase()} · model {data.forecast.modelVersion ?? "unknown"}.</p>
                <p role="status">
                  Sales: {data.forecast.sourceVersion?.startsWith("odoo_pos_order_line_local_complete_days") ? "POS order lines" : "source unavailable"} · {data.salesHistory?.startDate ?? "—"} to before {data.salesHistory?.endDateExclusive ?? "—"} · {data.historyDays} {data.salesHistory?.completeDaysOnly ? "complete days" : "days"} · {data.salesHistory?.timezone ?? "—"}
                  {data.salesHistory?.refunds === "SIGNED_NET_UNITS" ? " · refunds netted" : ""}.
                </p>
                {data.products.length > 0 && (
                  <p role="status">
                    History: {number.format(forecastReadinessSummary.valid)} valid · {number.format(forecastReadinessSummary.insufficientHistory)} need more history · {number.format(forecastReadinessSummary.lowConfidence)} low confidence.
                  </p>
                )}
                {data.forecast.costPolicy && (
                  <p>Assumptions: holding {number.format(data.forecast.costPolicy.annualHoldingRate * 100)}% / yr · slow-stock {number.format(data.forecast.costPolicy.annualObsolescenceRate * 100)}% / yr · service {number.format(data.forecast.costPolicy.serviceLevel * 100)}%.</p>
                )}
              </div>
            </details>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={exceptionOnly}
            onClick={() => setExceptionOnly((value) => !value)}
            className={`inline-flex h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] ${exceptionOnly ? "border-amber-300 bg-amber-50 text-amber-900" : "border-[var(--oh-border)] bg-white text-[var(--oh-text)] hover:bg-[var(--oh-paper)]"}`}
          >
            <AlertCircle size={16} aria-hidden="true" />
            {exceptionOnly ? "Exceptions only" : "Show exceptions"}
          </button>
          <label htmlFor="coverage-days" className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white pl-3 pr-2 text-sm font-medium text-[var(--oh-muted)]">
            <CalendarRange size={16} aria-hidden="true" />
            <span>Coverage</span>
            <select id="coverage-days" value={coverageDays} onChange={(event) => setCoverageDays(Number(event.target.value))} aria-label="Coverage target" className="h-full min-w-24 border-0 bg-transparent pl-1 pr-2 text-sm font-semibold text-[var(--oh-text)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--oh-primary)]">
              {coverageOptions.map((days) => <option key={days} value={days}>{days} days</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void load(true)} disabled={loading || refreshing} className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] outline-none hover:bg-[var(--oh-paper)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] disabled:opacity-60">{refreshing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh</button>
        </div>
      </header>

      {data && (loading || refreshing) && <p role="status" aria-live="polite" className="inline-flex items-center gap-2 text-sm text-[var(--oh-muted)]"><LoaderCircle size={16} className="animate-spin" /> Updating replenishment…</p>}

      {data?.exceptionMode && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">Showing {data.exceptionCount ?? data.products.length} exception items requiring attention. Purchase actions remain subject to manual review.</p>}

      {data && data.inventoryHistory?.status !== "FRESH" && <section aria-label="Daily inventory history" className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">Daily inventory history · {({ FRESH: "Up to date", STALE: "Capture overdue", REVIEW: "Needs review", UNAVAILABLE: "Not verified" })[data.inventoryHistory?.status ?? "UNAVAILABLE"]}</p>
        {data.inventoryHistory?.lastSuccessAt ? <>
          <p className="mt-1">Last successful capture {formatStoreEpoch(Date.parse(data.inventoryHistory.lastSuccessAt), data.inventoryHistory.businessTimezone ?? storeTimezone)} · {data.inventoryHistory.capturedProducts?.toLocaleString("en-AU")} / {data.inventoryHistory.expectedProducts?.toLocaleString("en-AU")} products ({Math.round((data.inventoryHistory.productCoverage ?? 0) * 100)}%).</p>
          <details className="mt-2">
            <summary className="cursor-pointer font-medium underline underline-offset-2">Capture details and missing fields</summary>
            <p className="mt-2">Latest business date {data.inventoryHistory.latestBusinessDate ?? "unknown"}; {data.inventoryHistory.observedDays} observed daily captures from {data.inventoryHistory.firstBusinessDate ?? "unknown"} · {data.inventoryHistory.gapDays} missing dates · {data.inventoryHistory.invalidSnapshots ?? 0} invalid snapshots. Collection is building an inventory history; this does not establish forecast accuracy.</p>
            <p className="mt-1">Capture timezone: {data.inventoryHistory.businessTimezone}. Confirm it matches the store location.</p>
            <p className="mt-1">Missing product fields: {Object.entries(data.inventoryHistory.missingFields ?? {}).map(([field, count]) => `${({ availableQty: "on hand", virtualAvailableQty: "forecast stock", incomingQty: "incoming", outgoingQty: "outgoing", cost: "cost", leadTimeDays: "supplier lead time" } as Record<string, string>)[field] ?? field}: ${count}`).join(" · ")}. Missing warehouse quantity fields: {data.inventoryHistory.missingWarehouseQuantityFields ?? 0}.</p>
            {data.inventoryHistory.supplierLeadTimeCoverage && <p className="mt-1">Supplier lead time source: {data.inventoryHistory.supplierLeadTimeCoverage.quality ?? "unknown"}; {data.inventoryHistory.supplierLeadTimeCoverage.productsWithLeadTime ?? 0} of {data.inventoryHistory.expectedProducts ?? 0} products have a lead time ({data.inventoryHistory.supplierLeadTimeCoverage.productsMissingLeadTime ?? 0} missing). Missing lead times use the coverage target and require review.</p>}
            {data.inventoryHistory.lastAttemptStatus === "FAILED" && <p className="mt-1 font-semibold">The latest capture failed. The last successful history is retained; ask an administrator to check collection.</p>}
          </details>
        </> : <p className="mt-1">A successful daily capture has not been verified for this store. Current stock readings do not replace a saved inventory history.</p>}
      </section>}

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900"><span className="flex items-start gap-2"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error} The plan below is the last successful result and may be out of date.</span><button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-red-300 bg-white px-3 font-semibold text-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60">{refreshing ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Retry</button></div>}

      {data && data.products.length > 0 && !hasRecentSales && <div role="status" className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><div className="flex items-start gap-2"><AlertCircle size={17} className="mt-0.5 shrink-0" /><p><strong>No recent sales found.</strong> There are no completed POS sales in the last {data.historyDays} days, so this plan cannot forecast demand. Zero suggested orders does not mean stock is sufficient.</p></div><Link href="/history" className="shrink-0 font-semibold text-amber-950 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800">Review Orithos sales history</Link></div>}

      {data && (data.excludedProductCount ?? 0) > 0 && <div role="status" className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"><AlertCircle size={17} className="mt-0.5 shrink-0" /><p><strong>{data.excludedProductCount} products excluded.</strong> Only stockable and purchasable Odoo products are eligible for replenishment suggestions.</p></div>}

      {createdRfq && (
        <div
          role={createdRfq.auditSaved && createdRfq.readbackVerified !== false && !createdRfq.warning ? "status" : "alert"}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm ${createdRfq.auditSaved && createdRfq.readbackVerified !== false && !createdRfq.warning ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}
        >
          <span>
            <strong>{createdRfq.name}</strong> created as a draft RFQ for {createdRfq.supplier}. It has not been sent or confirmed.{" "}
            {createdRfq.warning || (createdRfq.auditSaved ? "Internal approval audit saved to Orithos chatter." : "")}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={createdRfq ? `/purchases?orderId=${createdRfq.id}` : "/purchases"}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 font-semibold text-emerald-900 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
            >
              View Order
            </Link>
            <a href={createdRfq.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 font-semibold text-emerald-900 hover:bg-emerald-100">
              Open in Orithos <ExternalLink size={14} />
            </a>
          </div>
        </div>
      )}

      <section aria-label="Replenishment summary" className="grid gap-3 rounded-lg border border-[var(--oh-border)] bg-white px-4 py-3 text-sm shadow-[var(--oh-shadow-card)] md:grid-cols-3 md:gap-0 md:divide-x md:divide-[var(--oh-border)]">
        <div className="md:pr-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--oh-muted)]">Ready to order</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums leading-none text-[var(--oh-text)]">{number.format(orderReadyItems.length)}</p>
          <p className="mt-1 text-xs text-[var(--oh-muted)]">{number.format(totalOrderReadyUnits)} units suggested</p>
          {data?.businessMetrics?.suggestedOrderValue != null && (
            <p className="mt-1 text-xs tabular-nums text-[var(--oh-text-secondary)]">
              {data.businessMetrics.suggestedOrderValue.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 0, maximumFractionDigits: 0 })}{" "}
              <span className="text-[var(--oh-muted)]">est. cost</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setListFilter("out_of_stock")}
          className="rounded-md text-left outline-none transition hover:bg-[var(--oh-surface)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] md:px-4"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--oh-muted)]">OOS with sales</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums leading-none text-red-700">{number.format(outOfStockWithDemand)}</p>
          <p className="mt-1 text-xs text-[var(--oh-muted)]">View in list</p>
        </button>
        <div className="md:pl-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--oh-muted)]">Catalog data flags</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums leading-none text-[var(--oh-text-secondary)]">{number.format(data?.reviewRequiredCount ?? 0)}</p>
          <p className="mt-1 text-xs text-[var(--oh-muted)]">Across full catalogue · not in RFQ totals</p>
          {(data?.reviewRequiredCount ?? 0) > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setListFilter("urgent")} className="rounded-md border border-[var(--oh-border)] bg-white px-2 py-1 text-xs font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)]">Urgent · {number.format(urgentRiskCount)}</button>
              <button type="button" onClick={() => setListFilter("review")} className="rounded-md border border-[var(--oh-border)] bg-white px-2 py-1 text-xs font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)]">Review data</button>
            </div>
          )}
          {Object.keys(data?.reviewIssueCounts ?? {}).length > 0 && (
            <details className="mt-2 text-xs text-[var(--oh-muted)]">
              <summary className="cursor-pointer font-medium text-[var(--oh-text-secondary)]">Issue breakdown</summary>
              <p className="mt-1 leading-5">
                {Object.entries(data?.reviewIssueCounts ?? {}).map(([issue, count]) => `${issue.replaceAll("_", " ").toLowerCase()} ${count}`).join(" · ")}
              </p>
            </details>
          )}
        </div>
      </section>

      <section className="flex shrink-0 flex-col rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] xl:min-h-0 xl:flex-1 xl:overflow-hidden">
        <header className="flex flex-col gap-2.5 border-b border-[var(--oh-border)] px-4 py-3 md:px-5">
          <div>
            <h2 className="text-sm font-semibold text-[var(--oh-text)]">
              {listFilter === "all" ? "All products" : listFilter === "urgent" ? "Urgent" : listFilter === "out_of_stock" ? "Out of stock with sales" : listFilter === "missing_data" ? "Missing cost or lead time" : listFilter === "review" ? "Review data" : "Ready to order"}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--oh-muted)]">
              {number.format(filteredItems.length)} lines
              {selectedSuggested.length > 0 ? ` · ${number.format(selectedSuggested.length)} selected` : ""}
              {rfqSelectionTrimmed ? ` · draft uses top ${MAX_RFQ_LINES} by priority` : draftRfqEnabled ? ` · up to ${MAX_RFQ_LINES} per draft` : ""}
            </p>
            {selectedSuggested.length > 0 && selectedSupplierId == null && (
              <p className="mt-1 text-xs text-amber-800">Select products from one supplier for this draft RFQ.</p>
            )}
            {rfqSelectionTrimmed && (
              <p className="mt-1 text-xs text-amber-800">Only the highest-priority {MAX_RFQ_LINES} lines go into one draft RFQ. Deselect lines or run another draft for the rest.</p>
            )}
          </div>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15">
              <Search size={16} className="shrink-0 text-[var(--oh-muted)]" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search product or SKU"
                aria-label="Search product or SKU"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--oh-placeholder)]"
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid h-8 w-8 place-items-center rounded text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
                  <X size={14} />
                </button>
              ) : null}
            </label>
            <select
                value={supplierFilter}
                onChange={(event) => {
                  setSupplierFilter(event.target.value);
                  setSelectedIds(new Set());
                }}
                aria-label="Filter by supplier"
                className="h-10 w-full rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)] lg:w-[200px] lg:flex-none"
              >
                <option value="">All suppliers</option>
                {supplierGroups.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            <select
                value={listFilter}
                onChange={(event) => setListFilter(event.target.value as ListFilter)}
                aria-label="Filter replenishment list"
                className="h-10 w-full rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15 lg:w-[220px] lg:flex-none"
              >
                <option value="suggestions">Ready to order</option>
                <option value="urgent">Urgent risks ({number.format(urgentRiskCount)})</option>
                <option value="out_of_stock">Out of stock with demand</option>
                <option value="review">Review data ({data?.reviewRequiredCount ?? 0})</option>
                <option value="missing_data">Missing cost or lead time ({number.format(missingDataCount)})</option>
                <option value="slow_stock">Slow or overstocked</option>
                <option value="all">All products</option>
              </select>
            <button
              type="button"
              onClick={() => setShowMoreColumns((value) => !value)}
              aria-pressed={showMoreColumns}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold text-[var(--oh-text)] outline-none hover:bg-[var(--oh-surface)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
            >
              {showMoreColumns ? "Fewer columns" : "More columns"}
            </button>
            <button
              type="button"
              onClick={openRfqDialog}
              disabled={!canCreateRfq}
              title={!draftRfqEnabled ? "Draft RFQ creation is disabled in this environment" : undefined}
              className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white outline-none hover:bg-[var(--oh-primary-hover)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50 lg:ml-auto lg:w-auto"
            >
              <ShoppingCart size={16} aria-hidden="true" /> {draftRfqEnabled ? "Create draft RFQ" : "Draft RFQ disabled"} <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-xs tabular-nums">{rfqLineCount}</span>
            </button>
          </div>
        </header>

        <div className="divide-y divide-[var(--oh-border)] xl:hidden">
          {!filteredItems.length ? (
            <p className="px-4 py-12 text-center text-sm text-[var(--oh-muted)]">
              {data?.products.length
                ? query.trim()
                  ? "No products match this search."
                  : listFilter === "suggestions"
                    ? "No products need replenishment for this coverage target."
                    : listFilter === "urgent"
                      ? "No urgent stock risks were found."
                    : listFilter === "out_of_stock"
                      ? "No out-of-stock products with recent demand."
                    : listFilter === "missing_data"
                      ? "No products are missing a positive cost and lead time."
                      : listFilter === "slow_stock"
                        ? "No products match the slow or overstocked rule."
                      : "No POS products were returned by Orithos."
                : "No POS products were returned by Orithos."}
            </p>
          ) : pageItems.map((product) => {
            const label = friendlyProductName(product.name);
            const skuShort = truncateSku(product.sku);
            const selectable = isRfqReady(product);
            const checked = selectedIds.has(product.id);
            return (
              <article key={product.id} className="p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!selectable || !draftRfqEnabled}
                    onChange={() => toggleSelectProduct(product.id)}
                    aria-label={`Select ${label} for draft RFQ`}
                    className="mt-1 h-5 w-5 shrink-0 rounded border-[var(--oh-border)] text-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-40"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words font-semibold leading-5 text-[var(--oh-text)]" title={product.name}>{label}</h3>
                        <p className="mt-1 text-xs text-[var(--oh-muted)]">{skuShort ? <span title={product.sku || undefined}>SKU {skuShort} · </span> : ""}{product.unit}{product.supplierName ? " · " + product.supplierName : ""}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${riskClass(product.risk)}`}>{riskLabel(product.risk)}</span>
                          {product.attentionLevel && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${attentionClass(product.attentionLevel)}`} title={product.attentionReasons?.join(", ")}>{attentionLabel(product.attentionLevel)}</span>}
                          {product.confidence && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">{product.confidence.toLowerCase()} confidence</span>}
                        </div>
                      </div>
                      {product.suggestedQuantity > 0
                        ? <span className="shrink-0 rounded-full bg-[var(--oh-orange-light)] px-2.5 py-1 text-xs font-bold tabular-nums text-[var(--oh-orange-dark)]">Order {formatPurchaseQuantity(product.suggestedQuantity, product.caseQuantity)}</span>
                        : <span className="shrink-0 rounded-full bg-[var(--oh-surface)] px-2.5 py-1 text-xs font-medium text-[var(--oh-muted)]">{product.recommendationStatus === "REVIEW_DATA" ? "Review data" : "No order"}</span>}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-[var(--oh-surface)] p-3 text-sm">
                      <Metric label="Sold · 7d" value={number.format(product.soldUnits)} />
                      <Metric label="On hand" value={number.format(product.onHand)} danger={product.onHand <= 0 && product.soldUnits > 0} />
                      {showMoreColumns && (
                        <>
                          <Metric label="Forecast / day" value={number.format(product.unitsPerDay)} />
                          <Metric label="On order" value={product.onOrder == null ? "—" : number.format(product.onOrder)} />
                          <Metric label="Stock cover" value={product.daysOfStock === null ? "—" : `${number.format(product.daysOfStock)} days`} />
                          <Metric label="After suggested order" value={product.daysOfStockAfterReplenishment === null || product.daysOfStockAfterReplenishment === undefined ? "—" : `${number.format(product.daysOfStockAfterReplenishment)} days`} />
                          <Metric label="Supplier lead time" value={product.leadTimeDays === null || product.leadTimeDays === undefined ? "Unknown" : `${number.format(product.leadTimeDays)} days`} />
                          <div>
                            <p className="text-xs text-[var(--oh-muted)]">Trend · {data?.periodDays}d</p>
                            <div className="mt-1">{trendLabel(product, data?.periodDays ?? 28)}</div>
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-expanded={expandedReasonId === product.id}
                      onClick={() => setExpandedReasonId((current) => current === product.id ? null : product.id)}
                      className="mt-2 inline-flex min-h-9 items-center rounded-sm text-sm font-semibold text-[var(--oh-orange-dark)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
                    >
                      {expandedReasonId === product.id ? "Hide explanation" : "Explain suggestion"}
                    </button>
                    {expandedReasonId === product.id && (
                      <div className="mt-2 space-y-2 text-sm leading-5 text-[var(--oh-text-secondary)]">
                        {!showMoreColumns && (
                          <dl className="grid grid-cols-2 gap-2 rounded-md bg-[var(--oh-surface)] px-3 py-2 text-xs">
                            <div><dt className="text-[var(--oh-muted)]">Forecast / day</dt><dd className="mt-0.5 tabular-nums">{number.format(product.unitsPerDay)}</dd></div>
                            <div><dt className="text-[var(--oh-muted)]">Forecast stock</dt><dd className="mt-0.5 tabular-nums">{number.format(product.forecastStock)}</dd></div>
                            <div><dt className="text-[var(--oh-muted)]">Stock cover</dt><dd className="mt-0.5 tabular-nums">{product.daysOfStock === null ? "—" : `${number.format(product.daysOfStock)} days`}</dd></div>
                            <div><dt className="text-[var(--oh-muted)]">Trend · {data?.periodDays}d</dt><dd className="mt-0.5">{trendLabel(product, data?.periodDays ?? 28)}</dd></div>
                          </dl>
                        )}
                        <ForecastSelectionExplanation product={product} />
                        <ul className="ml-1 list-disc space-y-1 pl-4">
                          {(product.reasonParts?.length ? product.reasonParts : [product.reason || "No detail available."]).map((part) => <li key={part}>{part}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="hidden min-h-0 flex-1 overflow-auto xl:block xl:min-h-[104px]">
          <table aria-label="Replenishment recommendations" className={`w-full border-collapse text-left text-sm ${showMoreColumns ? "min-w-[980px]" : "min-w-[720px]"}`}>
            <thead className="sticky top-0 bg-[#f7f8f8] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
              <tr>
                <th scope="col" className="w-12 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(element) => {
                      if (element) element.indeterminate = someVisibleSelected && !allVisibleSelected;
                    }}
                    onChange={toggleSelectAllVisible}
                     disabled={!draftRfqEnabled || !visibleSelectableIds.length}
                    aria-label="Select all visible suggestions for draft RFQ"
                    className="h-4 w-4 rounded border-[var(--oh-border)] text-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-40"
                  />
                </th>
                <th scope="col" className="px-4 py-3">Product</th>
                <th scope="col" className="px-4 py-3 text-right">Sold · 7d</th>
                {showMoreColumns && (
                  <>
                    <th scope="col" className="px-4 py-3 text-right">Forecast / day</th>
                    <th scope="col" className="px-4 py-3 text-right">Trend · {data?.periodDays}d</th>
                  </>
                )}
                <th scope="col" className="px-4 py-3 text-right">On hand</th>
                {showMoreColumns && (
                  <>
                    <th scope="col" className="px-4 py-3 text-right">On order</th>
                    <th scope="col" className="px-4 py-3 text-right">Stock cover</th>
                  </>
                )}
                <th scope="col" className="px-4 py-3 text-right">Suggested order</th>
                <th scope="col" className="px-4 py-3">Why</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--oh-border)]">
              {!filteredItems.length ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-4 py-5 text-center text-[var(--oh-muted)]">
                    {data?.products.length
                      ? query.trim()
                        ? "No products match this search."
                        : listFilter === "suggestions"
                          ? "No products need replenishment for this coverage target."
                          : listFilter === "urgent"
                            ? "No urgent stock risks were found."
                          : listFilter === "out_of_stock"
                            ? "No out-of-stock products with recent demand."
                          : listFilter === "missing_data"
                            ? "No products are missing a positive cost and lead time."
                            : "No POS products were returned by Orithos."
                      : "No POS products were returned by Orithos."}
                  </td>
                </tr>
              ) : pageItems.map((product) => {
                const label = friendlyProductName(product.name);
                const skuShort = truncateSku(product.sku);
                const selectable = isRfqReady(product);
                return (
                  <tr key={product.id} className="hover:bg-sky-50/40">
                    <td className="px-3 py-2.5 align-top">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                         disabled={!selectable || !draftRfqEnabled}
                        onChange={() => toggleSelectProduct(product.id)}
                        aria-label={`Select ${label} for draft RFQ`}
                        className="h-4 w-4 rounded border-[var(--oh-border)] text-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-40"
                      />
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <span className="block font-medium leading-snug text-[var(--oh-text)]" title={product.name}>{label}</span>
                      <span className="mt-0.5 block text-xs text-[var(--oh-muted)]">{skuShort ? <span title={product.sku || undefined}>SKU {skuShort} · </span> : ""}{product.unit}{product.supplierName ? " · " + product.supplierName : ""}</span>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold leading-tight ${riskClass(product.risk)}`}>{riskLabel(product.risk)}</span>
                        {product.attentionLevel && product.attentionLevel !== "LOW" && (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold leading-tight ${attentionClass(product.attentionLevel)}`} title={product.attentionReasons?.join(", ")}>{attentionLabel(product.attentionLevel)}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--oh-text-secondary)] align-top">{number.format(product.soldUnits)}</td>
                    {showMoreColumns && (
                      <>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{number.format(product.unitsPerDay)}</td>
                        <td className="px-4 py-3 text-right">{trendLabel(product, data?.periodDays ?? 28)}</td>
                      </>
                    )}
                    <td className={`px-4 py-3 text-right tabular-nums ${product.onHand <= 0 && product.soldUnits > 0 ? "font-semibold text-red-700" : "text-[var(--oh-text-secondary)]"}`}>{number.format(product.onHand)}</td>
                    {showMoreColumns && (
                      <>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]" title="Units recorded as on order">{product.onOrder == null ? "—" : number.format(product.onOrder)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{product.daysOfStock === null ? "—" : `${number.format(product.daysOfStock)} days`}</td>
                      </>
                    )}
                    <td className="px-4 py-3 text-right">
                      {product.suggestedQuantity > 0
                        ? <span className="inline-flex min-w-16 justify-center rounded-full bg-[var(--oh-orange-light)] px-2.5 py-1 text-xs font-bold tabular-nums text-[var(--oh-orange-dark)]">{formatPurchaseQuantity(product.suggestedQuantity, product.caseQuantity)}</span>
                        : <span className="text-xs text-[var(--oh-muted)]">{product.recommendationStatus === "REVIEW_DATA" ? "Review data" : "No order"}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--oh-muted)]">
                      <button
                        type="button"
                        aria-expanded={expandedReasonId === product.id}
                        onClick={() => setExpandedReasonId((current) => current === product.id ? null : product.id)}
                        className="inline-flex min-h-9 items-center rounded-sm text-sm font-semibold text-[var(--oh-orange-dark)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
                      >
                        {expandedReasonId === product.id ? "Hide" : "Explain"}
                      </button>
                      {expandedReasonId === product.id && (
                        <div className="mt-2 max-w-xs space-y-2 text-left text-[var(--oh-text-secondary)]">
                          {!showMoreColumns && (
                            <dl className="grid grid-cols-2 gap-2 rounded-md bg-[var(--oh-surface)] px-2 py-1.5 text-xs">
                              <div><dt className="text-[var(--oh-muted)]">Forecast / day</dt><dd className="mt-0.5 tabular-nums">{number.format(product.unitsPerDay)}</dd></div>
                              <div><dt className="text-[var(--oh-muted)]">Forecast stock</dt><dd className="mt-0.5 tabular-nums">{number.format(product.forecastStock)}</dd></div>
                              <div><dt className="text-[var(--oh-muted)]">Stock cover</dt><dd className="mt-0.5 tabular-nums">{product.daysOfStock === null ? "—" : `${number.format(product.daysOfStock)} days`}</dd></div>
                              <div><dt className="text-[var(--oh-muted)]">After suggested order</dt><dd className="mt-0.5 tabular-nums">{product.daysOfStockAfterReplenishment === null || product.daysOfStockAfterReplenishment === undefined ? "—" : `${number.format(product.daysOfStockAfterReplenishment)} days`}</dd></div>
                              <div><dt className="text-[var(--oh-muted)]">Supplier lead time</dt><dd className="mt-0.5 tabular-nums">{product.leadTimeDays === null || product.leadTimeDays === undefined ? "Unknown" : `${number.format(product.leadTimeDays)} days`}</dd></div>
                              <div><dt className="text-[var(--oh-muted)]">Trend</dt><dd className="mt-0.5">{trendLabel(product, data?.periodDays ?? 28)}</dd></div>
                            </dl>
                          )}
                          <ForecastSelectionExplanation product={product} />
                          <ul className="list-disc space-y-1 pl-4">
                            {(product.reasonParts?.length ? product.reasonParts : [product.reason || "No detail available."]).map((part) => (
                              <li key={part}>{part}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredItems.length > 0 && <nav aria-label="Replenishment pages" className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--oh-border)] px-4 py-2 text-sm">
          <span>{(currentPage - 1) * 100 + 1}–{Math.min(currentPage * 100, filteredItems.length)} of {filteredItems.length} · Page {currentPage} of {pageCount}</span>
          <div className="flex gap-2">
            <button type="button" disabled={currentPage <= 1} onClick={() => setPagination({ key: pageKey, page: currentPage - 1 })} className="min-h-11 rounded border px-3 disabled:opacity-40">Previous</button>
            <button type="button" disabled={currentPage >= pageCount} onClick={() => setPagination({ key: pageKey, page: currentPage + 1 })} className="min-h-11 rounded border px-3 disabled:opacity-40">Next</button>
          </div>
        </nav>}
        {data?.salesHistory && !data.salesHistory.timezoneVerified && <p role="status" className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950">Timezone fallback: {data.salesHistory.timezone}. Verify store settings.</p>}
         {!draftRfqEnabled && <p role="status" className="border-t border-[var(--oh-border)] px-4 py-2 text-xs text-[var(--oh-muted)]">Preview only — create orders from <Link href="/purchases" className="font-semibold text-[var(--oh-primary)] underline-offset-2 hover:underline">Purchase Orders</Link>.</p>}
        {data?.truncated && <p role="status" className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950">This plan has incomplete catalogue coverage. Refresh before relying on store totals.</p>}
      </section>

      {auditEntries.length > 0 && (
        <section className="rounded-lg border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
          <h2 className="text-sm font-semibold text-[var(--oh-text)]">Recent draft RFQs</h2>
          <p className="mt-1 text-xs text-[var(--oh-muted)]">The browser shows recent approvals from this device. Each RFQ keeps the forecast method, coverage target, suggested and ordered quantities, and reasons in an internal Orithos chatter note.</p>
          <ul className="mt-3 divide-y divide-[var(--oh-border)]">
            {auditEntries.slice(0, 8).map((entry) => {
              const edited = entry.lines.filter((line) => Math.abs(line.orderedQuantity - line.suggestedQuantity) > 0.001).length;
              const adopted = entry.lines.length - edited;
              return (
                <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium text-[var(--oh-text)]">{entry.rfqName} · {entry.supplierName}</p>
                    <p className="mt-0.5 text-xs text-[var(--oh-muted)]">
                      {formatStoreDateTime(entry.createdAt, storeTimezone)}
                      {" · "}{entry.lines.length} lines · {adopted} kept as suggested · {edited} edited · cover {entry.coverageDays}d
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link href="/purchases" className="inline-flex items-center text-xs font-semibold text-[var(--oh-orange-dark)] hover:underline">Purchases</Link>
                    <a href={entry.rfqUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--oh-orange-dark)] hover:underline">Open RFQ <ExternalLink size={12} /></a>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {methodOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setMethodOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="method-title" className="my-auto w-full max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-2xl md:p-6">
            <header className="flex items-start justify-between gap-3">
              <h2 id="method-title" className="text-lg font-semibold text-[var(--oh-text)]">How this estimate works</h2>
              <button
                ref={methodCloseRef}
                type="button"
                onClick={() => setMethodOpen(false)}
                aria-label="Close"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
              >
                <X size={18} />
              </button>
            </header>
            <p className="mt-3 text-sm leading-6 text-[var(--oh-text-secondary)]">
              {data?.forecast?.enabled
                ? "Products with enough history are assigned a model using rolling backtests; intermittent products can use Croston or TSB, while short histories remain explicitly marked as insufficient and use the transparent rules fallback. The forecast interval shown in each row is a demand range, not a guarantee. "
                : `Forecast daily demand combines the most recent ${data?.periodDays ?? 28} days (70%) with the previous ${data?.periodDays ?? 28} days (30%); if one period has no sales, the other period is used. `}
              Suggested order uses weighted sales demand over {planCoverageDays} days, less units on hand and on order. A positive suggestion is raised to the supplier’s minimum quantity and rounded up to a full case when the pack size is known. Stock cover estimates how long shelf stock will last using recent demand. Use Explain for the inputs behind each suggestion.
            </p>
            <footer className="mt-5 flex justify-end">
              <button type="button" onClick={() => setMethodOpen(false)} className="min-h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Close</button>
            </footer>
          </section>
        </div>
      )}

      {rfqOpen && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !rfqSubmitting) setRfqOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="rfq-title" className="my-auto flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-[var(--oh-border)] p-5 md:px-6">
            <div><h2 id="rfq-title" className="text-lg font-semibold text-[var(--oh-text)]">Review draft RFQ</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Choose one supplier and check the quantities before creating a draft in Orithos.</p></div>
            <button type="button" onClick={() => setRfqOpen(false)} disabled={rfqSubmitting} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"><X size={18} /></button>
          </header>
          <form onSubmit={(event) => void submitRfq(event)} className="flex min-h-0 flex-1 flex-col">
            <div className="grid min-w-0 gap-4 overflow-y-auto p-5 md:px-6">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]"><span>Supplier <span className="text-red-700">*</span></span>
                <select ref={rfqSupplierRef} value={rfqSupplierId} onChange={(event) => setRfqSupplierId(event.target.value)} required disabled={rfqLoadingSuppliers || rfqSubmitting} className="h-11 w-full min-w-0 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-normal text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60">
                  <option value="">{rfqLoadingSuppliers ? "Loading suppliers…" : rfqSuppliers.length ? "Select an Orithos supplier" : rfqSupplierError ? "Supplier list unavailable" : "No suppliers available"}</option>
                  {rfqSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.email ? ` · ${supplier.email}` : ""}</option>)}
                </select>
              </label>
              {rfqSupplierError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900"><span>{rfqSupplierError}</span><button type="button" onClick={() => { if (selectedSupplierId != null) void loadRfqSuppliers(selectedSupplierId); }} disabled={rfqLoadingSuppliers} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-red-300 bg-white px-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"><RefreshCw size={15} /> Retry suppliers</button></div>}
              <div className="overflow-hidden rounded-lg border border-[var(--oh-border)]">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-[#f7f8f8] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]"><span>Selected products</span><span>{selectedRfqLines.length} with quantity</span></div>
                <div className="max-h-[38dvh] divide-y divide-[var(--oh-border)] overflow-y-auto">
                  {rfqLines.map((line) => <div key={line.productId} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(96px,120px)] items-center gap-3 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_140px_140px]">
                    <div className="min-w-0"><p className="break-words text-sm font-medium text-[var(--oh-text)]">{line.name}</p><p className="text-xs text-[var(--oh-muted)]">Suggested {number.format(line.suggestedQuantity)} {line.unit}</p></div>
                    <label className="grid gap-1 text-[13px] font-medium text-[var(--oh-muted)] sm:col-auto">Order quantity
                    <input type="number" min="0" max={MAX_RFQ_QUANTITY} step="0.01" value={line.quantity} onChange={(event) => { const value = Number(event.target.value); setRfqLines((current) => current.map((item) => item.productId === line.productId ? { ...item, quantity: Number.isFinite(value) ? value : 0 } : item)); }} disabled={rfqSubmitting} className="h-11 w-full min-w-0 rounded-md border border-[var(--oh-border)] px-2 text-sm font-semibold tabular-nums text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[#f3920030] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60" />
                    </label>
                    <p className="hidden text-right text-sm text-[var(--oh-muted)] sm:block">{line.unit}</p>
                    {line.quantity !== line.suggestedQuantity && <label className="col-span-full grid gap-1 text-[13px] font-medium text-[var(--oh-muted)]">Reason for quantity change
                      <textarea required maxLength={300} value={line.adjustmentReason} onChange={(event) => setRfqLines((current) => current.map((item) => item.productId === line.productId ? { ...item, adjustmentReason: event.target.value } : item))} disabled={rfqSubmitting} rows={2} className="w-full rounded-md border border-[var(--oh-border)] px-2 py-2 text-sm text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60" />
                    </label>}
                  </div>)}
                  {!rfqLines.length && <p className="px-4 py-8 text-center text-sm text-[var(--oh-muted)]">No products selected for this RFQ.</p>}
                </div>
              </div>
              {selectedSuggested.length > MAX_RFQ_LINES && <p className="text-xs leading-5 text-amber-900">This RFQ includes the first {MAX_RFQ_LINES} selected suggestions. Create another RFQ for the remaining products.</p>}
              <div className="rounded-md bg-[var(--oh-surface)] px-3 py-2.5 text-xs leading-5 text-[var(--oh-muted)]"><p className="font-semibold text-[var(--oh-text-secondary)]">Draft only</p><p className="mt-1">This creates an Orithos RFQ in draft status. It will not email the supplier or confirm an order. Review the supplier prices, taxes, delivery dates and quantities in Orithos before sending.</p></div>
              {rfqError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{rfqError}</p>}
            </div>
            <footer className="flex flex-col gap-2 border-t border-[var(--oh-border)] p-4 sm:flex-row sm:justify-end md:px-6">
              <button type="button" onClick={() => setRfqOpen(false)} disabled={rfqSubmitting} className="min-h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={rfqSubmitting || rfqLoadingSuppliers || !rfqSuppliers.length || !selectedRfqLines.length} className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-60">{rfqSubmitting ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} {rfqSubmitting ? "Creating draft…" : "Create draft RFQ"}</button>
            </footer>
          </form>
        </section>
      </div>}
    </Container>
  );
}

function ReplenishmentSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading replenishment" className="flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-[var(--oh-surface)] p-4 md:gap-5 md:p-6">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-[var(--oh-muted)]">Stock planning</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--oh-text)]">Replenishment</h1>
          <p role="status" aria-live="polite" className="mt-1 text-sm text-[var(--oh-muted)]">Loading current stock and sales history…</p>
        </div>
        <div className="h-11 w-64 animate-pulse rounded-md bg-[var(--oh-border)]" />
      </header>
      <div className="h-12 animate-pulse rounded-lg border border-[var(--oh-border)] bg-white" />
      <section className="min-h-0 flex-1 animate-pulse rounded-lg border border-[var(--oh-border)] bg-white" />
    </section>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div><p className="text-xs text-[var(--oh-muted)]">{label}</p><p className={`mt-1 font-semibold tabular-nums ${danger ? "text-red-700" : "text-[var(--oh-text-secondary)]"}`}>{value}</p></div>;
}
