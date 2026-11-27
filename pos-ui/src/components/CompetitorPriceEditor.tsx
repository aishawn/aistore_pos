"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AlertCircle, Check, ExternalLink, LoaderCircle, Plus, X } from "lucide-react";
import {
  addCompetitorObservation,
  reviewCompetitorObservation,
  type CompetitorObservation,
  type CompetitorSource,
} from "@/lib/competitor-prices";
import { api } from "@/lib/api";

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

function localDateTimeValue(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function storeLocalDateTime(utcValue: string, timeZone: string) {
  const parsed = new Date(`${utcValue.replace(" ", "T")}Z`);
  if (!Number.isFinite(parsed.getTime())) return utcValue.replace("T", " ").slice(0, 16);
  return new Intl.DateTimeFormat("en-AU", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(parsed);
}

export function CompetitorPriceEditor({
  productId,
  productName,
  productSku,
  productVolumeMl,
  productVintage,
  productAbv,
  storeTimezone,
  sources,
  observations,
  onChanged,
}: {
  productId: number;
  productName: string;
  productSku: string;
  productVolumeMl: number | null;
  productVintage: string | null;
  productAbv: number | null;
  storeTimezone: string;
  sources: CompetitorSource[];
  observations: CompetitorObservation[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState<number | "">("");
  const [price, setPrice] = useState("");
  const [memberPrice, setMemberPrice] = useState("");
  const [competitorName, setCompetitorName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [volumeMl, setVolumeMl] = useState("");
  const [vintage, setVintage] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [promotionStartsAt, setPromotionStartsAt] = useState("");
  const [promotionEndsAt, setPromotionEndsAt] = useState("");
  const [observedAt, setObservedAt] = useState(() => localDateTimeValue(storeTimezone));
  const [packSize, setPackSize] = useState("1");
  const [priceType, setPriceType] = useState<CompetitorObservation["priceType"]>("STANDARD");
  const [priceTaxBasis, setPriceTaxBasis] = useState<CompetitorObservation["priceTaxBasis"] | "">("");
  const [promotionTerms, setPromotionTerms] = useState("");
  const [matchDecisions, setMatchDecisions] = useState<Record<number, "" | "PASS" | "FAIL">>({});
  const [priceDecisions, setPriceDecisions] = useState<Record<number, "" | "PASS" | "FAIL">>({});
  const [matchNotes, setMatchNotes] = useState<Record<number, string>>({});
  const [priceNotes, setPriceNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const activeSources = useMemo(() => sources.filter((source) =>
    source.enabled && source.postcode && source.accessMode === "MANUAL_ONLY"), [sources]);

  async function loadCurrentUser() {
    try {
      const user = await api.get<{ id?: number }>("/api/auth/me");
      setCurrentUserId(user.id ?? null);
    } catch { setCurrentUserId(null); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const source = activeSources.find((item) => item.id === sourceId);
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      await addCompetitorObservation({
        productId,
        sourceId: source.id,
        competitorProductName: competitorName.trim(),
        barcode: barcode.trim() || null,
        volumeMl: volumeMl ? Number(volumeMl) : null,
        vintage: vintage.trim() || null,
        packSize: Number(packSize),
        priceType,
        priceTaxBasis: priceTaxBasis as CompetitorObservation["priceTaxBasis"],
        observedPrice: Number(price),
        memberPrice: memberPrice ? Number(memberPrice) : null,
        promotionTerms: promotionTerms.trim() || null,
        promotionStartsAt: promotionStartsAt ? `${promotionStartsAt.replace("T", " ")}:00` : null,
        promotionEndsAt: promotionEndsAt ? `${promotionEndsAt.replace("T", " ")}:00` : null,
        postcode: source.postcode!,
        fulfillment: source.fulfillment ?? "DELIVERY",
        sourceUrl,
        evidenceUrl: evidenceUrl.trim() || null,
        matchMethod: "MANUAL",
        matchConfidence: null,
        observedAt: `${observedAt.replace("T", " ")}:00`,
        observedTimezone: storeTimezone,
      });
      setPrice(""); setMemberPrice(""); setCompetitorName(""); setBarcode(""); setVolumeMl(""); setVintage(""); setSourceUrl(""); setEvidenceUrl(""); setPromotionTerms(""); setPromotionStartsAt(""); setPromotionEndsAt("");
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record this price.");
    } finally {
      setBusy(false);
    }
  }

  async function review(id: number) {
    setBusy(true);
    setError(null);
    try {
      await reviewCompetitorObservation(id, {
        matchStatus: matchDecisions[id] as "PASS" | "FAIL",
        priceStatus: priceDecisions[id] as "PASS" | "FAIL",
        matchNote: matchNotes[id]?.trim() || null,
        priceNote: priceNotes[id]?.trim() || null,
      });
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not review this observation.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-3 border-t border-[var(--oh-border)] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[var(--oh-text-secondary)]">Competitor prices</p>
        <button type="button" onClick={() => {
          if (!open) {
            setObservedAt(localDateTimeValue(storeTimezone));
            void loadCurrentUser();
          }
          setOpen((value) => !value);
        }} aria-expanded={open} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--oh-border)] px-2.5 text-xs font-semibold text-[var(--oh-text)]">
          {open ? <X size={14} /> : <Plus size={14} />} {open ? "Close" : "Record / review"}
        </button>
      </div>
      {observations.filter((item) => item.reviewStatus === "VERIFIED").length ? (
        <ul className="mt-2 space-y-1.5">
          {observations.filter((item) => item.reviewStatus === "VERIFIED").map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--oh-text-secondary)]">
              <span className="font-semibold text-[var(--oh-text)]">{item.competitor}</span>
              <span>{item.sourceType === "MANUFACTURER" ? "Manufacturer list price" : "Retailer price"}</span>
              <span>Product match {item.matchReviewStatus === "PASS" ? "independently verified" : "not verified"} · price {item.priceReviewStatus === "PASS" ? "verified" : "not verified"}</span>
              <span>{item.priceType.toLowerCase()} · {money.format(item.observedPrice)}{item.memberPrice != null ? ` · Member ${money.format(item.memberPrice)}` : ""}</span>
              <span>{item.packSize > 1 ? `${item.packSize} pack` : "single"}</span>
              {item.unitPrice != null && <span>{money.format(item.unitPrice)}{item.unitPriceBasis === "PER_LITRE" ? "/L" : "/unit"}</span>}
              {item.promotionTerms && <span>{item.promotionTerms}</span>}
              <span>{item.postcode} · {item.fulfillment.toLowerCase()}</span>
              <time dateTime={`${item.observedAt.replace(" ", "T")}Z`}>{storeLocalDateTime(item.observedAt, item.observedTimezone)} {item.observedTimezone}</time>
              <a href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open ${item.competitor} price evidence`} title="Open price source" className="text-[var(--oh-primary)]"><ExternalLink size={13} /></a>
            </li>
          ))}
        </ul>
      ) : <p className="mt-1 text-xs text-[var(--oh-muted)]">No recent verified, comparable price observations.</p>}

      {open && <div className="mt-3 space-y-3">
        {error && <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900"><AlertCircle size={14} />{error}</p>}
        {observations.filter((item) => item.reviewStatus === "PENDING_REVIEW").map((item) => (
          <div key={item.id} className="grid gap-2 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3 text-xs">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words font-semibold text-[var(--oh-text)]">{item.competitorProductName}</p>
                <p className="mt-0.5 text-[var(--oh-text-secondary)]">{item.competitor} · {item.sourceType === "MANUFACTURER" ? "Manufacturer" : "Retailer"} · Pending review</p>
                <p className="mt-1 break-words text-[var(--oh-text-secondary)]">
                  POS match: {productName} · {productSku || "No POS barcode"}
                  {productVolumeMl != null ? " · " + productVolumeMl + " mL" : ""}
                  {productAbv != null ? " · " + productAbv + "% ABV" : ""}
                  {productVintage ? " · " + productVintage : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--oh-border)] bg-white px-2 font-medium text-[var(--oh-primary)]">
                  <ExternalLink size={13} /> Open listing
                </a>
                {item.evidenceUrl && <a href={item.evidenceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--oh-border)] bg-white px-2 font-medium text-[var(--oh-primary)]">
                  <ExternalLink size={13} /> Open evidence
                </a>}
              </div>
            </div>
            <dl className="grid gap-x-4 gap-y-1 text-[var(--oh-text-secondary)] sm:grid-cols-2">
              <div><dt className="inline font-semibold">Barcode: </dt><dd className="inline">{item.barcode || "Not recorded"}</dd></div>
              <div><dt className="inline font-semibold">Pack: </dt><dd className="inline">{item.packSize} × {item.volumeMl ? item.volumeMl + " mL" : "volume not recorded"}{item.vintage ? " · " + item.vintage : ""}</dd></div>
              <div><dt className="inline font-semibold">Price: </dt><dd className="inline">{item.priceType.toLowerCase()} · {money.format(item.observedPrice)} · {item.priceTaxBasis.toLowerCase().replaceAll("_", " ")}{item.memberPrice != null ? " · Member " + money.format(item.memberPrice) : ""}</dd></div>
              <div><dt className="inline font-semibold">Promotion: </dt><dd className="inline">{item.promotionTerms || "No terms recorded"}{item.promotionStartsAt ? " · from " + storeLocalDateTime(item.promotionStartsAt, item.observedTimezone) : ""}{item.promotionEndsAt ? " · to " + storeLocalDateTime(item.promotionEndsAt, item.observedTimezone) : ""}</dd></div>
              <div><dt className="inline font-semibold">Region / fulfilment: </dt><dd className="inline">{item.postcode} · {item.fulfillment.toLowerCase()}</dd></div>
              <div><dt className="inline font-semibold">Observed: </dt><dd className="inline">{storeLocalDateTime(item.observedAt, item.observedTimezone)} {item.observedTimezone}</dd></div>
            </dl>
            {currentUserId != null && currentUserId !== item.createdBy && <div className="flex flex-wrap gap-2 border-t border-[var(--oh-border)] pt-2">
              <label className="grid min-w-40 flex-1 gap-1 text-xs text-[var(--oh-text-secondary)]">Product and pack match
                <select value={matchDecisions[item.id] ?? ""} onChange={(event) => setMatchDecisions((current) => ({ ...current, [item.id]: event.target.value as "" | "PASS" | "FAIL" }))} className="h-9 rounded-md border border-[var(--oh-border)] bg-white px-2 text-sm">
                  <option value="">Choose decision</option><option value="PASS">Pass</option><option value="FAIL">Fail</option>
                </select>
              </label>
              <label className="grid min-w-40 flex-1 gap-1 text-xs text-[var(--oh-text-secondary)]">Displayed price and conditions
                <select value={priceDecisions[item.id] ?? ""} onChange={(event) => setPriceDecisions((current) => ({ ...current, [item.id]: event.target.value as "" | "PASS" | "FAIL" }))} className="h-9 rounded-md border border-[var(--oh-border)] bg-white px-2 text-sm">
                  <option value="">Choose decision</option><option value="PASS">Pass</option><option value="FAIL">Fail</option>
                </select>
              </label>
              {matchDecisions[item.id] === "FAIL" && <label className="grid w-full gap-1 text-xs text-[var(--oh-text-secondary)]">Match failure reason
                <input required value={matchNotes[item.id] ?? ""} onChange={(event) => setMatchNotes((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={1024} className="h-9 rounded-md border border-[var(--oh-border)] px-2 text-sm" />
              </label>}
              {priceDecisions[item.id] === "FAIL" && <label className="grid w-full gap-1 text-xs text-[var(--oh-text-secondary)]">Price failure reason
                <input required value={priceNotes[item.id] ?? ""} onChange={(event) => setPriceNotes((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={1024} className="h-9 rounded-md border border-[var(--oh-border)] px-2 text-sm" />
              </label>}
              <button type="button" disabled={busy || !matchDecisions[item.id] || !priceDecisions[item.id] || (matchDecisions[item.id] === "FAIL" && !(matchNotes[item.id] ?? "").trim()) || (priceDecisions[item.id] === "FAIL" && !(priceNotes[item.id] ?? "").trim())} onClick={() => void review(item.id)} className="min-h-9 rounded-md border border-green-300 bg-white px-2 font-semibold text-green-800 disabled:opacity-50"><Check size={13} className="mr-1 inline" />Save review</button>
            </div>}
          </div>
        ))}
        <form onSubmit={(event) => void submit(event)} className="grid gap-2 rounded-md border border-[var(--oh-border)] p-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)]">Source product name
            <select required value={sourceId} onChange={(event) => setSourceId(event.target.value ? Number(event.target.value) : "")} className="h-10 rounded-md border border-[var(--oh-border)] bg-white px-2 text-sm">
              <option value="">Choose an enabled source</option>{activeSources.map((source) => <option key={source.id} value={source.id}>{source.name} · {source.postcode}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)]">Competitor product / exact pack
            <input required value={competitorName} onChange={(event) => setCompetitorName(event.target.value)} placeholder={productName} maxLength={512} className="h-10 rounded-md border border-[var(--oh-border)] px-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)]">Observed displayed price (AUD)
            <input required type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className="h-10 rounded-md border border-[var(--oh-border)] px-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)]">Price type
            <select value={priceType} onChange={(event) => setPriceType(event.target.value as typeof priceType)} className="h-10 rounded-md border border-[var(--oh-border)] bg-white px-2 text-sm"><option value="STANDARD">Standard</option><option value="PROMOTION">Promotion</option><option value="MULTIBUY">Multibuy</option><option value="MEMBER">Member</option><option value="CLEARANCE">Clearance</option></select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)]">GST basis
            <select required value={priceTaxBasis} onChange={(event) => setPriceTaxBasis(event.target.value as typeof priceTaxBasis)} className="h-10 rounded-md border border-[var(--oh-border)] bg-white px-2 text-sm"><option value="">Choose basis</option><option value="INCLUDES_GST">Includes GST</option><option value="EXCLUDES_GST">Excludes GST</option><option value="UNKNOWN">Unknown</option></select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)]">Pack size
            <input required type="number" min="1" step="1" value={packSize} onChange={(event) => setPackSize(event.target.value)} className="h-10 rounded-md border border-[var(--oh-border)] px-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)]">Member price (AUD)
            <input type="number" min="0.01" step="0.01" value={memberPrice} onChange={(event) => setMemberPrice(event.target.value)} placeholder="Optional" className="h-10 rounded-md border border-[var(--oh-border)] px-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)]">Barcode / EAN
            <input value={barcode} onChange={(event) => setBarcode(event.target.value)} maxLength={64} placeholder="Optional" className="h-10 rounded-md border border-[var(--oh-border)] px-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)]">Volume (mL)
            <input type="number" min="1" step="1" value={volumeMl} onChange={(event) => setVolumeMl(event.target.value)} placeholder="Optional" className="h-10 rounded-md border border-[var(--oh-border)] px-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)]">Vintage
            <input value={vintage} onChange={(event) => setVintage(event.target.value)} maxLength={16} placeholder="Optional" className="h-10 rounded-md border border-[var(--oh-border)] px-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)]">Promotion conditions
            <input value={promotionTerms} onChange={(event) => setPromotionTerms(event.target.value)} maxLength={512} placeholder={priceType === "STANDARD" ? "Optional" : "Required for this price type"} required={priceType !== "STANDARD"} className="h-10 rounded-md border border-[var(--oh-border)] px-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)]">Promotion starts
            <input type="datetime-local" value={promotionStartsAt} onChange={(event) => setPromotionStartsAt(event.target.value)} className="h-10 rounded-md border border-[var(--oh-border)] px-2 text-sm" />
            <span className="text-[11px] font-normal">{storeTimezone}</span>
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)]">Promotion ends
            <input type="datetime-local" value={promotionEndsAt} onChange={(event) => setPromotionEndsAt(event.target.value)} className="h-10 rounded-md border border-[var(--oh-border)] px-2 text-sm" />
            <span className="text-[11px] font-normal">{storeTimezone}</span>
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)]">Observed at
            <input required type="datetime-local" value={observedAt} onChange={(event) => setObservedAt(event.target.value)} className="h-10 rounded-md border border-[var(--oh-border)] px-2 text-sm" />
            <span className="text-[11px] font-normal">{storeTimezone}</span>
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)] sm:col-span-2">Public product page URL
            <input required type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" className="h-10 rounded-md border border-[var(--oh-border)] px-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)] sm:col-span-2">Evidence URL
            <input required type="url" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="Stored evidence allowed by source terms" className="h-10 rounded-md border border-[var(--oh-border)] px-2 text-sm" />
          </label>
          {!activeSources.length && <p className="text-xs text-amber-800 sm:col-span-2">No source is approved for manual collection with a configured postcode.</p>}
          <button type="submit" disabled={busy || !activeSources.length} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />} Save for review
          </button>
        </form>
      </div>}
    </div>
  );
}
