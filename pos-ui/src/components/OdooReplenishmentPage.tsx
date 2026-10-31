"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarRange,
  Check,
  CircleHelp,
  Clock3,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  X,
} from "lucide-react";
import { createOdooDraftRfq, fetchOdooRoute, getOdooSuppliers, type OdooDraftRfq, type OdooSupplierOption } from "@/lib/odoo-api";
import { appendReplenishmentAudit, readReplenishmentAudit, type ReplenishmentAuditEntry } from "@/lib/replenishment-audit";
import { getOdooPosBootstrap } from "@/lib/odoo-api";
import { formatOdooDateTime, formatStoreEpoch } from "@/lib/odoo-date";
import {
  friendlyProductName,
  looksLikeR2ImportMarker,
  truncateSku,
} from "@/lib/product-display-name";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import type { InventorySnapshotStatus } from "@/lib/inventory-snapshot-status";
import type { ForecastBusinessCost } from "@/lib/forecast-business-cost";

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
  forecastStock: number;
  daysOfStock: number | null;
  daysOfStockAfterReplenishment?: number | null;
  leadTimeDays?: number | null;
  risk?: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
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
  truncated: boolean;
  catalogueCoverage?: { status: string; loadedProducts: number; eligibleProducts: number; forecastedProducts: number };
  salesHistory?: { timezone: string; timezoneVerified: boolean };
  reviewRequiredCount?: number;
  reviewIssueCounts?: Record<string, number>;
  excludedProductCount?: number;
  productEligibility?: string;
  generatedAt: string;
  inventoryHistory?: InventorySnapshotStatus;
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
};

type ListFilter = "suggestions" | "out_of_stock" | "review" | "all";

const coverageOptions = [7, 14, 21, 28, 42];
const number = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });
const MAX_RFQ_LINES = 100;
const MAX_RFQ_QUANTITY = 100_000;

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
  const [data, setData] = useState<ReplenishmentData | null>(null);
  const [coverageDays, setCoverageDays] = useState(21);
  const [listFilter, setListFilter] = useState<ListFilter>("suggestions");
  const [query, setQuery] = useState("");
  const [showMoreColumns, setShowMoreColumns] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ key: "", page: 1 });
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [rfqOpen, setRfqOpen] = useState(false);
  const [rfqLoadingSuppliers, setRfqLoadingSuppliers] = useState(false);
  const [rfqSubmitting, setRfqSubmitting] = useState(false);
  const [rfqSuppliers, setRfqSuppliers] = useState<OdooSupplierOption[]>([]);
  const [rfqSupplierId, setRfqSupplierId] = useState("");
  const [rfqSupplierError, setRfqSupplierError] = useState<string | null>(null);
  const [rfqLines, setRfqLines] = useState<DraftRfqLine[]>([]);
  const [rfqError, setRfqError] = useState<string | null>(null);
  const [createdRfq, setCreatedRfq] = useState<OdooDraftRfq | null>(null);
  const [auditEntries, setAuditEntries] = useState<ReplenishmentAuditEntry[]>([]);
  const [expandedReasonId, setExpandedReasonId] = useState<number | null>(null);
  const [storeTimezone, setStoreTimezone] = useState("Australia/Adelaide");
  const requestRevision = useRef(0);
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

  useEffect(() => {
    setAuditEntries(readReplenishmentAudit());
  }, []);

  const load = useCallback(async (refresh = false) => {
    const revision = ++requestRevision.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetchOdooRoute(`/api/odoo/replenishment?coverageDays=${coverageDays}`, { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json().catch(() => null) as ReplenishmentData | { message?: string } | null;
      if (revision !== requestRevision.current) return;
      if (!response.ok) {
        const message = payload && "message" in payload ? payload.message : undefined;
        setNeedsConnection(response.status === 401);
        throw new Error(message || `Could not load the replenishment plan (${response.status}).`);
      }
      if (!payload || !("products" in payload) || !Array.isArray(payload.products)) throw new Error("Orithos returned an incomplete replenishment plan.");
      setNeedsConnection(false);
      setData(payload);
      setSelectedIds(new Set(payload.products.filter((product) => product.suggestedQuantity > 0).map((product) => product.id)));
      try {
        const bootstrap = await getOdooPosBootstrap();
        if (revision !== requestRevision.current) return;
        const activeConfig = bootstrap.configs.find((config) => config.session) ?? bootstrap.configs[0];
        if (activeConfig?.timezone) setStoreTimezone(activeConfig.timezone);
      } catch {
        // The replenishment response remains useful when register metadata is unavailable.
      }
      setLastLoadedAt(Date.now());
    } catch (cause) {
      if (revision === requestRevision.current) {
        setError(cause instanceof Error ? cause.message : "Could not load the replenishment plan.");
      }
    } finally {
      if (revision === requestRevision.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [coverageDays]);

  useEffect(() => { void load(); }, [load]);

  const suggestedItems = useMemo(() => data?.products.filter((product) => product.suggestedQuantity > 0) ?? [], [data]);
  const totalSuggestedUnits = suggestedItems.reduce((sum, product) => sum + product.suggestedQuantity, 0);
  const outOfStockWithDemand = (data?.products ?? []).filter((product) => product.onHand <= 0 && product.soldUnits > 0).length;
  const hasRecentSales = data?.products.some((product) => product.soldUnits > 0) ?? false;
  const showR2DisplayNote = useMemo(
    () => (data?.products ?? []).some((product) => looksLikeR2ImportMarker(product.name) || looksLikeR2ImportMarker(product.sku)),
    [data],
  );

  const filteredItems = useMemo(() => {
    const base = data?.products ?? [];
    const byFilter = listFilter === "suggestions"
      ? base.filter((product) => product.suggestedQuantity > 0)
      : listFilter === "review" ? base.filter((product) => product.recommendationStatus === "REVIEW_DATA")
      : listFilter === "out_of_stock"
        ? base.filter((product) => product.onHand <= 0 && product.soldUnits > 0)
        : base;
    const normalized = query.trim().toLowerCase();
    if (!normalized) return byFilter;
    return byFilter.filter((product) => {
      const label = friendlyProductName(product.name).toLowerCase();
      return label.includes(normalized)
        || product.name.toLowerCase().includes(normalized)
        || product.sku.toLowerCase().includes(normalized);
    });
  }, [data, listFilter, query]);

  const pageKey = `${data?.generatedAt ?? ""}|${listFilter}|${query}`;
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / 100));
  const currentPage = pagination.key === pageKey ? Math.min(pagination.page, pageCount) : 1;
  const pageItems = useMemo(() => filteredItems.slice((currentPage - 1) * 100, currentPage * 100), [filteredItems, currentPage]);

  const selectedSuggested = useMemo(
    () => suggestedItems.filter((product) => selectedIds.has(product.id)),
    [suggestedItems, selectedIds],
  );
  const selectedCount = Math.min(selectedSuggested.length, MAX_RFQ_LINES);
  const selectedRfqLines = rfqLines.filter((line) => line.quantity > 0);
  const planCoverageDays = data?.coverageDays ?? coverageDays;
  const planReady = Boolean(data) && !loading && !refreshing && !error && data?.coverageDays === coverageDays;
  const canCreateRfq = planReady && selectedSuggested.length > 0;

  const visibleSelectableIds = useMemo(
    () => pageItems.filter((product) => product.suggestedQuantity > 0).map((product) => product.id),
    [pageItems],
  );
  const allVisibleSelected = visibleSelectableIds.length > 0 && visibleSelectableIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleSelectableIds.some((id) => selectedIds.has(id));

  function toggleSelectAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const id of visibleSelectableIds) next.delete(id);
      } else {
        for (const id of visibleSelectableIds) next.add(id);
      }
      return next;
    });
  }

  function toggleSelectProduct(productId: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function openRfqDialog() {
    if (!canCreateRfq) return;
    rfqRequestId.current = crypto.randomUUID();
    const lines = selectedSuggested.slice(0, MAX_RFQ_LINES).map((product) => ({
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
    void loadRfqSuppliers();
  }

  async function loadRfqSuppliers() {
    const revision = ++rfqSupplierRevision.current;
    setRfqLoadingSuppliers(true);
    setRfqSupplierError(null);
    setRfqSuppliers([]);
    setRfqSupplierId("");
    try {
      const suppliers = await getOdooSuppliers();
      if (revision !== rfqSupplierRevision.current) return;
      setRfqSuppliers(suppliers);
      if (suppliers.length === 1) setRfqSupplierId(String(suppliers[0].id));
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
    if (!Number.isSafeInteger(supplierId) || supplierId < 1) {
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
      const result = await createOdooDraftRfq({
        requestId: rfqRequestId.current,
        supplierId,
        coverageDays,
        method: data?.forecast?.modelSelection ?? "rules_v1_weighted_velocity",
        lines: rfqLines.map((line) => ({ productId: line.productId, quantity: line.quantity, suggestedQuantity: line.suggestedQuantity, reason: approvalReason(line) })),
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
    <Container className="relative flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 md:gap-5 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Stock planning · {data?.company}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {!embedded && <h1 className="text-2xl font-semibold tracking-tight text-[var(--oh-text)]">Replenishment</h1>}
            <button
              ref={helpButtonRef}
              type="button"
              onClick={() => setMethodOpen(true)}
              aria-label="How this estimate works"
              className="grid h-9 w-9 place-items-center rounded-md text-[var(--oh-muted)] outline-none hover:bg-[var(--oh-paper)] hover:text-[var(--oh-text)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
            >
              <CircleHelp size={18} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">
            {data?.forecast?.enabled ? "Per-product forecast with rolling model selection" : "Rule-based reorder suggestions"} · draft RFQs only · nothing auto-orders.
            {lastLoadedAt !== null && <span className="ml-2">Last refreshed {formatStoreEpoch(lastLoadedAt, storeTimezone)}.</span>}
          </p>
          {data?.forecast?.enabled && (
            <p className="mt-1 text-xs text-[var(--oh-muted)]">
              Forecast service {data.forecast.status.toLowerCase()} · model version {data.forecast.modelVersion ?? "unknown"}. Products with insufficient history remain explicitly marked and use the rules fallback.
            </p>
          )}
          {data?.forecast?.costPolicy && <p className="mt-1 text-xs text-[var(--oh-muted)]">Planning assumptions to review: holding {number.format(data.forecast.costPolicy.annualHoldingRate * 100)}% / year · slow-stock risk {number.format(data.forecast.costPolicy.annualObsolescenceRate * 100)}% / year · target service {number.format(data.forecast.costPolicy.serviceLevel * 100)}%.</p>}
          {showR2DisplayNote && (
            <p className="mt-1 text-xs text-[var(--oh-muted)]">
              Import prefixes such as R2 TEST are hidden in product names; SKUs may still start with R2- for reconciliation.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      {data && <section aria-label="Daily inventory history" className={`rounded-md border px-4 py-3 text-sm ${data.inventoryHistory?.status === "FRESH" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
        <p className="font-semibold">Daily inventory history · {({ FRESH: "Up to date", STALE: "Capture overdue", REVIEW: "Needs review", UNAVAILABLE: "Not verified" })[data.inventoryHistory?.status ?? "UNAVAILABLE"]}</p>
        {data.inventoryHistory?.lastSuccessAt ? <>
          <p className="mt-1">Last successful capture {formatStoreEpoch(Date.parse(data.inventoryHistory.lastSuccessAt), data.inventoryHistory.businessTimezone ?? storeTimezone)} · {data.inventoryHistory.capturedProducts?.toLocaleString("en-AU")} / {data.inventoryHistory.expectedProducts?.toLocaleString("en-AU")} products ({Math.round((data.inventoryHistory.productCoverage ?? 0) * 100)}%) · {data.inventoryHistory.capturedWarehouses} / {data.inventoryHistory.expectedWarehouses} warehouses.</p>
          <details className="mt-2">
            <summary className="cursor-pointer font-medium underline underline-offset-2">Capture details and missing fields</summary>
            <p className="mt-2">{data.inventoryHistory.observedDays} observed daily captures · {data.inventoryHistory.gapDays} missing dates. Collection is building an inventory history; this does not establish forecast accuracy.</p>
            <p className="mt-1">Capture timezone: {data.inventoryHistory.businessTimezone}. Confirm it matches the store location.</p>
            <p className="mt-1">Missing product fields: {Object.entries(data.inventoryHistory.missingFields ?? {}).map(([field, count]) => `${({ availableQty: "on hand", virtualAvailableQty: "forecast stock", incomingQty: "incoming", outgoingQty: "outgoing", cost: "cost", leadTimeDays: "supplier lead time" } as Record<string, string>)[field] ?? field}: ${count}`).join(" · ")}. Missing warehouse quantity fields: {data.inventoryHistory.missingWarehouseQuantityFields ?? 0}.</p>
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

      <section aria-label="Replenishment summary" className="flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-lg border border-[var(--oh-border)] bg-white px-4 py-3 text-sm shadow-[var(--oh-shadow-card)]">
        <p><span className="font-semibold tabular-nums text-[var(--oh-text)]">{number.format(suggestedItems.length)}</span> <span className="text-[var(--oh-muted)]">to replenish</span></p>
        <p><span className="font-semibold tabular-nums text-[var(--oh-text)]">{number.format(totalSuggestedUnits)}</span> <span className="text-[var(--oh-muted)]">suggested units · {planCoverageDays}d</span></p>
        <p><span className="font-semibold tabular-nums text-[var(--oh-text)]">{number.format(outOfStockWithDemand)}</span> <span className="text-[var(--oh-muted)]">out of stock with demand</span></p>
        <p className="text-[var(--oh-muted)]">{number.format(data?.products.length ?? 0)} POS products in plan</p>
        {(data?.reviewRequiredCount ?? 0) > 0 && <p className="text-amber-900">{number.format(data?.reviewRequiredCount ?? 0)} need data review; excluded from order value and forecast-risk totals.</p>}
        {data?.businessMetrics?.suggestedOrderValue !== null && data?.businessMetrics?.suggestedOrderValue !== undefined && <p><span className="font-semibold tabular-nums text-[var(--oh-text)]">${number.format(data.businessMetrics.suggestedOrderValue)}</span> <span className="text-[var(--oh-muted)]">estimated order value</span></p>}
        {data?.businessMetrics?.productsWithExpectedStockout !== undefined && <p><span className="font-semibold tabular-nums text-red-700">{number.format(data.businessMetrics.productsWithExpectedStockout)}</span> <span className="text-[var(--oh-muted)]">forecast risks (review items excluded)</span></p>}
      </section>

      <section className="flex shrink-0 flex-col rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] xl:min-h-0 xl:flex-1 xl:overflow-hidden">
        <header className="flex flex-col gap-3 border-b border-[var(--oh-border)] px-4 py-3 md:px-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--oh-text)]">
                {listFilter === "all" ? "All POS products" : listFilter === "out_of_stock" ? "Out of stock with demand" : "Replenishment suggestions"}
              </h2>
              <p className="mt-1 text-xs text-[var(--oh-muted)]">
                {filteredItems.length} matching · {selectedSuggested.length} selected for RFQ
                {selectedSuggested.length > MAX_RFQ_LINES ? ` (first ${MAX_RFQ_LINES} used)` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={openRfqDialog}
              disabled={!canCreateRfq}
              className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white outline-none hover:bg-[var(--oh-primary-hover)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShoppingCart size={16} /> Create draft RFQ <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-xs">{selectedCount}</span>
            </button>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15">
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
            <label className="grid w-full gap-1 text-xs font-medium text-[var(--oh-muted)] lg:w-[200px] lg:flex-none">
              Filter
              <select
                value={listFilter}
                onChange={(event) => setListFilter(event.target.value as ListFilter)}
                aria-label="Filter replenishment list"
                className="h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15"
              >
                <option value="suggestions">Suggestions only</option>
                <option value="out_of_stock">Out of stock with demand</option>
                <option value="review">Review data ({data?.reviewRequiredCount ?? 0})</option>
                <option value="all">All products</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => setShowMoreColumns((value) => !value)}
              aria-pressed={showMoreColumns}
              className="inline-flex h-11 items-center justify-center rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold text-[var(--oh-text)] outline-none hover:bg-[var(--oh-surface)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] lg:self-end"
            >
              {showMoreColumns ? "Fewer columns" : "More columns"}
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
                    : listFilter === "out_of_stock"
                      ? "No out-of-stock products with recent demand."
                      : "No POS products were returned by Orithos."
                : "No POS products were returned by Orithos."}
            </p>
          ) : pageItems.map((product) => {
            const label = friendlyProductName(product.name);
            const skuShort = truncateSku(product.sku);
            const selectable = product.suggestedQuantity > 0;
            const checked = selectedIds.has(product.id);
            return (
              <article key={product.id} className="p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!selectable}
                    onChange={() => toggleSelectProduct(product.id)}
                    aria-label={`Select ${label} for draft RFQ`}
                    className="mt-1 h-5 w-5 shrink-0 rounded border-[var(--oh-border)] text-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-40"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words font-semibold leading-5 text-[var(--oh-text)]" title={product.name}>{label}</h3>
                        <p className="mt-1 text-xs text-[var(--oh-muted)]">{skuShort ? <span title={product.sku || undefined}>SKU {skuShort} · </span> : ""}{product.unit}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${riskClass(product.risk)}`}>{riskLabel(product.risk)}</span>
                          {product.confidence && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">{product.confidence.toLowerCase()} confidence</span>}
                        </div>
                      </div>
                      {product.suggestedQuantity > 0
                        ? <span className="shrink-0 rounded-full bg-[var(--oh-orange-light)] px-2.5 py-1 text-xs font-bold tabular-nums text-[var(--oh-orange-dark)]">Order {number.format(product.suggestedQuantity)} {product.unit}</span>
                        : <span className="shrink-0 rounded-full bg-[var(--oh-surface)] px-2.5 py-1 text-xs font-medium text-[var(--oh-muted)]">{product.recommendationStatus === "REVIEW_DATA" ? "Review data" : "No order"}</span>}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-[var(--oh-surface)] p-3 text-sm">
                      <Metric label={`Sold · ${data?.historyDays}d`} value={number.format(product.soldUnits)} />
                      <Metric label="On hand" value={number.format(product.onHand)} danger={product.onHand <= 0 && product.soldUnits > 0} />
                      {showMoreColumns && (
                        <>
                          <Metric label="Forecast / day" value={number.format(product.unitsPerDay)} />
                          <Metric label="Forecast stock" value={number.format(product.forecastStock)} />
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
                      className="mt-2 inline-flex min-h-11 items-center rounded-sm font-semibold text-[var(--oh-orange-dark)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
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
                    disabled={!visibleSelectableIds.length}
                    aria-label="Select all visible suggestions for draft RFQ"
                    className="h-4 w-4 rounded border-[var(--oh-border)] text-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-40"
                  />
                </th>
                <th scope="col" className="px-4 py-3">Product</th>
                <th scope="col" className="px-4 py-3 text-right">Sold · {data?.historyDays}d</th>
                {showMoreColumns && (
                  <>
                    <th scope="col" className="px-4 py-3 text-right">Forecast / day</th>
                    <th scope="col" className="px-4 py-3 text-right">Trend · {data?.periodDays}d</th>
                  </>
                )}
                <th scope="col" className="px-4 py-3 text-right">On hand</th>
                {showMoreColumns && (
                  <>
                    <th scope="col" className="px-4 py-3 text-right">Forecast stock</th>
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
                          : listFilter === "out_of_stock"
                            ? "No out-of-stock products with recent demand."
                            : "No POS products were returned by Orithos."
                      : "No POS products were returned by Orithos."}
                  </td>
                </tr>
              ) : pageItems.map((product) => {
                const label = friendlyProductName(product.name);
                const skuShort = truncateSku(product.sku);
                const selectable = product.suggestedQuantity > 0;
                return (
                  <tr key={product.id} className="hover:bg-sky-50/40">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        disabled={!selectable}
                        onChange={() => toggleSelectProduct(product.id)}
                        aria-label={`Select ${label} for draft RFQ`}
                        className="h-4 w-4 rounded border-[var(--oh-border)] text-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-40"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="block font-medium text-[var(--oh-text)]" title={product.name}>{label}</span>
                      <span className="mt-0.5 block text-xs text-[var(--oh-muted)]">{skuShort ? <span title={product.sku || undefined}>SKU {skuShort} · </span> : ""}{product.unit}</span>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${riskClass(product.risk)}`}>{riskLabel(product.risk)}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{number.format(product.soldUnits)}</td>
                    {showMoreColumns && (
                      <>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{number.format(product.unitsPerDay)}</td>
                        <td className="px-4 py-3 text-right">{trendLabel(product, data?.periodDays ?? 28)}</td>
                      </>
                    )}
                    <td className={`px-4 py-3 text-right tabular-nums ${product.onHand <= 0 && product.soldUnits > 0 ? "font-semibold text-red-700" : "text-[var(--oh-text-secondary)]"}`}>{number.format(product.onHand)}</td>
                    {showMoreColumns && (
                      <>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]" title="Orithos forecast quantity includes scheduled incoming and outgoing stock moves">{number.format(product.forecastStock)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{product.daysOfStock === null ? "—" : `${number.format(product.daysOfStock)} days`}</td>
                      </>
                    )}
                    <td className="px-4 py-3 text-right">
                      {product.suggestedQuantity > 0
                        ? <span className="inline-flex min-w-16 justify-center rounded-full bg-[var(--oh-orange-light)] px-2.5 py-1 text-xs font-bold tabular-nums text-[var(--oh-orange-dark)]">{number.format(product.suggestedQuantity)} {product.unit}</span>
                        : <span className="text-xs text-[var(--oh-muted)]">{product.recommendationStatus === "REVIEW_DATA" ? "Review data" : "No order"}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--oh-muted)]">
                      <button
                        type="button"
                        aria-expanded={expandedReasonId === product.id}
                        onClick={() => setExpandedReasonId((current) => current === product.id ? null : product.id)}
                        className="inline-flex min-h-11 items-center rounded-sm font-semibold text-[var(--oh-orange-dark)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
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
        {data?.catalogueCoverage?.status === "COMPLETE" && <p role="status" className="border-t border-[var(--oh-border)] px-4 py-2 text-xs text-[var(--oh-muted)]">Complete catalogue: {data.catalogueCoverage.loadedProducts} POS products checked · {data.catalogueCoverage.eligibleProducts} eligible for replenishment. Search and totals include every page.</p>}
        {data?.salesHistory && !data.salesHistory.timezoneVerified && <p role="status" className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950">Store timezone uses {data.salesHistory.timezone} as a fallback. Verify the store state in Orithos; forecast confidence is reduced.</p>}
        {(data?.reviewRequiredCount ?? 0) > 0 && <div role="status" className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950"><p>{data?.reviewRequiredCount} products need stock, cost or purchase unit checks. Their purchase suggestions are paused. Choose “Review data” to inspect them.</p><p className="mt-1 text-xs">Reasons: {Object.entries(data?.reviewIssueCounts ?? {}).map(([issue, count]) => `${issue.replaceAll("_", " ").toLowerCase()} ${count}`).join(" · ") || "details unavailable"}.</p></div>}
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
                      {formatOdooDateTime(entry.createdAt, storeTimezone)}
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

      <p className="inline-flex items-center gap-2 text-xs text-[var(--oh-muted)]"><Clock3 size={14} />Generated {data ? formatOdooDateTime(data.generatedAt, storeTimezone) : "—"}.</p>

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
              Suggested order = max(0, forecast demand × the larger of {planCoverageDays} days or supplier lead time − forecast stock), rounded up to a whole unit. “After suggested order” shows the estimated stock cover after adding that quantity. Forecast stock comes from Orithos and includes scheduled incoming and outgoing stock moves, helping avoid ordering units already on the way. Missing supplier lead time falls back to the coverage target. This estimate does not account for pack sizes, holidays or store-specific events. Use Explain on each row for the exact inputs behind a suggestion.
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
              {rfqSupplierError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900"><span>{rfqSupplierError}</span><button type="button" onClick={() => void loadRfqSuppliers()} disabled={rfqLoadingSuppliers} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-red-300 bg-white px-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"><RefreshCw size={15} /> Retry suppliers</button></div>}
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
        <div className="grid gap-2"><span className="h-3 w-40 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-8 w-48 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 w-80 max-w-[80vw] animate-pulse rounded bg-[var(--oh-border)]" /></div>
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
