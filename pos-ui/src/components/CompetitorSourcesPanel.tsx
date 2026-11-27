"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertCircle, Check, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { addCustomCompetitorSource, configureCompetitorSource, configureCompetitorSourcePermission, getCompetitorSources, type CompetitorSource } from "@/lib/competitor-prices";
import { api } from "@/lib/api";

export function CompetitorSourcesPanel() {
  const [sources, setSources] = useState<CompetitorSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customType, setCustomType] = useState<CompetitorSource["sourceType"]>("RETAILER");
  const [isAdmin, setIsAdmin] = useState(false);
  const [termsUrls, setTermsUrls] = useState<Record<number, string>>({});
  const [confirmedSources, setConfirmedSources] = useState<Record<number, boolean>>({});
  const [reviewSummaries, setReviewSummaries] = useState<Record<number, string>>({});
  const [permittedFields, setPermittedFields] = useState<Record<number, string>>({});
  const [retentionTerms, setRetentionTerms] = useState<Record<number, string>>({});
  const [rateLimits, setRateLimits] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSources(await getCompetitorSources());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load competitor sources.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getCompetitorSources().then((result) => {
      if (!cancelled) setSources(result);
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load competitor sources.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    void api.get<{ isAdmin?: boolean }>("/api/auth/me").then((user) => setIsAdmin(user.isAdmin === true)).catch(() => setIsAdmin(false));
  }, []);

  async function save(source: CompetitorSource, patch: Partial<CompetitorSource>) {
    setSavingId(source.id);
    setError(null);
    try {
      setSources(await configureCompetitorSource(source.id, {
        postcode: patch.postcode ?? source.postcode ?? "",
        fulfillment: patch.fulfillment ?? source.fulfillment ?? "DELIVERY",
        enabled: patch.enabled ?? source.enabled,
        refreshDays: patch.refreshDays ?? 7,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save competitor settings.");
    } finally {
      setSavingId(null);
    }
  }

  async function reviewPermission(source: CompetitorSource, accessMode: "UNREVIEWED" | "MANUAL_ONLY" | "BLOCKED") {
    setSavingId(source.id);
    setError(null);
    try {
      setSources(await configureCompetitorSourcePermission(source.id, {
        accessMode,
        termsUrl: accessMode === "MANUAL_ONLY" ? (termsUrls[source.id] ?? source.termsUrl ?? "").trim() : null,
        reviewSummary: reviewSummaries[source.id] ?? source.reviewSummary ?? "",
        permittedFields: permittedFields[source.id] ?? source.permittedFields ?? "",
        retentionTerms: retentionTerms[source.id] ?? source.retentionTerms ?? "",
        rateLimitTerms: rateLimits[source.id] ?? source.rateLimitTerms ?? "",
        confirmedReview: accessMode === "MANUAL_ONLY" && confirmedSources[source.id] === true,
      }));
      setConfirmedSources((current) => ({ ...current, [source.id]: false }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the source permission review.");
    } finally { setSavingId(null); }
  }

  async function addSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingId(-1);
    setError(null);
    try {
      setSources(await addCustomCompetitorSource(customName.trim(), customType, customUrl.trim()));
      setCustomName(""); setCustomUrl("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add this competitor.");
    } finally { setSavingId(null); }
  }

  return (
    <section className="rounded-lg border border-[var(--oh-border)] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--oh-border)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--oh-text)]">Competitor price sources</h2>
          <p className="mt-1 text-xs text-[var(--oh-muted)]">Target review cadence: weekly. Price collection is currently manual.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh competitor sources" title="Refresh competitor sources" className="grid size-10 shrink-0 place-items-center rounded-md border border-[var(--oh-border)] text-[var(--oh-text)] disabled:opacity-50">
          {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
      </div>
      {error && <p role="alert" className="m-3 flex gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-900"><AlertCircle size={16} />{error}</p>}
      {loading && !sources.length ? <p className="px-4 py-5 text-sm text-[var(--oh-muted)]">Loading sources…</p> : (
        <ul className="divide-y divide-[var(--oh-border)]">
          {sources.map((source) => (
            <li key={source.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
              <div className="min-w-0">
                <a href={source.baseUrl} target="_blank" rel="noreferrer" className="font-medium text-[var(--oh-primary)] underline underline-offset-2">{source.name}</a>
                <p className="mt-0.5 text-xs text-[var(--oh-muted)]">
                  <span className="font-semibold">{source.sourceType === "MANUFACTURER" ? "Manufacturer" : "Retailer"}</span>
                  {" · "}{source.accessMode === "UNREVIEWED" ? "Permission not reviewed; collection and display disabled" :
                    source.accessMode === "BLOCKED" ? "Collection and display blocked" :
                    source.accessMode === "MANUAL_ONLY" ? "Approved for manual collection only" : source.accessMode}
                </p>
                {source.termsUrl && <a href={source.termsUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-[var(--oh-primary)] underline">Reviewed terms</a>}
              </div>
              <label className="flex min-h-10 items-center gap-2 text-sm text-[var(--oh-text)]">
                <input type="checkbox" checked={source.enabled} disabled={savingId === source.id || ["UNREVIEWED", "BLOCKED"].includes(source.accessMode)} onChange={(event) => void save(source, { enabled: event.target.checked })} className="size-4 accent-[var(--oh-primary)]" />
                Include
              </label>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`competitor-postcode-${source.id}`}>Postcode for {source.name}</label>
                <input id={`competitor-postcode-${source.id}`} defaultValue={source.postcode ?? ""} placeholder="Postcode" inputMode="numeric" maxLength={12} onBlur={(event) => {
                  const postcode = event.currentTarget.value.trim();
                  if (postcode && postcode !== source.postcode) void save(source, { postcode });
                }} className="h-10 w-28 rounded-md border border-[var(--oh-border)] px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]" />
                <label className="sr-only" htmlFor={`competitor-fulfillment-${source.id}`}>Fulfilment for {source.name}</label>
                <select id={`competitor-fulfillment-${source.id}`} value={source.fulfillment ?? "DELIVERY"} onChange={(event) => void save(source, { fulfillment: event.target.value as CompetitorSource["fulfillment"] })} className="h-10 rounded-md border border-[var(--oh-border)] bg-white px-2 text-sm">
                  <option value="DELIVERY">Delivery</option><option value="PICKUP">Pickup</option><option value="IN_STORE">In store</option>
                </select>
                {savingId === source.id && <LoaderCircle size={15} className="animate-spin text-[var(--oh-muted)]" aria-label="Saving" />}
              </div>
              {isAdmin && <div className="grid gap-2 sm:col-span-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="grid gap-1 text-xs text-[var(--oh-muted)]">Terms / license URL
                  <input type="url" value={termsUrls[source.id] ?? source.termsUrl ?? ""} onChange={(event) => setTermsUrls((current) => ({ ...current, [source.id]: event.target.value }))} placeholder="https://retailer.example/terms" className="h-9 min-w-0 rounded-md border border-[var(--oh-border)] px-2 text-sm text-[var(--oh-text)]" />
                </label>
                <label className="grid gap-1 text-xs text-[var(--oh-muted)]">Permission decision summary
                  <textarea value={reviewSummaries[source.id] ?? source.reviewSummary ?? ""} onChange={(event) => setReviewSummaries((current) => ({ ...current, [source.id]: event.target.value }))} maxLength={4000} className="min-h-16 min-w-0 rounded-md border border-[var(--oh-border)] p-2 text-sm text-[var(--oh-text)]" />
                </label>
                <label className="grid gap-1 text-xs text-[var(--oh-muted)]">Fields permitted to collect and retain
                  <textarea value={permittedFields[source.id] ?? source.permittedFields ?? ""} onChange={(event) => setPermittedFields((current) => ({ ...current, [source.id]: event.target.value }))} maxLength={4000} className="min-h-16 min-w-0 rounded-md border border-[var(--oh-border)] p-2 text-sm text-[var(--oh-text)]" />
                </label>
                <label className="grid gap-1 text-xs text-[var(--oh-muted)]">Retention and reuse conditions
                  <textarea value={retentionTerms[source.id] ?? source.retentionTerms ?? ""} onChange={(event) => setRetentionTerms((current) => ({ ...current, [source.id]: event.target.value }))} maxLength={4000} className="min-h-16 min-w-0 rounded-md border border-[var(--oh-border)] p-2 text-sm text-[var(--oh-text)]" />
                </label>
                <label className="grid gap-1 text-xs text-[var(--oh-muted)]">Rate limits and access restrictions
                  <textarea value={rateLimits[source.id] ?? source.rateLimitTerms ?? ""} onChange={(event) => setRateLimits((current) => ({ ...current, [source.id]: event.target.value }))} maxLength={512} className="min-h-16 min-w-0 rounded-md border border-[var(--oh-border)] p-2 text-sm text-[var(--oh-text)]" />
                </label>
                <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
                  <label className="flex min-h-9 items-center gap-2 text-xs text-[var(--oh-text-secondary)]">
                    <input type="checkbox" checked={confirmedSources[source.id] ?? false} onChange={(event) => setConfirmedSources((current) => ({ ...current, [source.id]: event.target.checked }))} className="size-4 accent-[var(--oh-primary)]" />
                    Terms permit manual commercial collection and storage
                  </label>
                  <button type="button" disabled={savingId === source.id || !(termsUrls[source.id] ?? source.termsUrl) || !confirmedSources[source.id] || !(reviewSummaries[source.id] ?? source.reviewSummary)?.trim() || !(permittedFields[source.id] ?? source.permittedFields)?.trim() || !(retentionTerms[source.id] ?? source.retentionTerms)?.trim() || !(rateLimits[source.id] ?? source.rateLimitTerms)?.trim()} onClick={() => void reviewPermission(source, "MANUAL_ONLY")} className="min-h-9 rounded-md border border-[var(--oh-border)] px-2 text-xs font-semibold disabled:opacity-50">Approve manual</button>
                  <button type="button" disabled={savingId === source.id} onClick={() => void reviewPermission(source, "BLOCKED")} className="min-h-9 rounded-md border border-red-200 px-2 text-xs font-semibold text-red-800 disabled:opacity-50">Block</button>
                  {source.accessMode !== "UNREVIEWED" && <button type="button" disabled={savingId === source.id} onClick={() => void reviewPermission(source, "UNREVIEWED")} className="min-h-9 rounded-md border border-[var(--oh-border)] px-2 text-xs font-semibold disabled:opacity-50">Revoke approval</button>}
                </div>
              </div>}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(event) => void addSource(event)} className="grid gap-2 border-t border-[var(--oh-border)] p-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
        <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)]">Source name
          <input required value={customName} onChange={(event) => setCustomName(event.target.value)} maxLength={160} placeholder="Independent bottle shop" className="h-10 rounded-md border border-[var(--oh-border)] px-2 text-sm" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)]">Price source type
          <select value={customType} onChange={(event) => setCustomType(event.target.value as CompetitorSource["sourceType"])} className="h-10 rounded-md border border-[var(--oh-border)] bg-white px-2 text-sm">
            <option value="RETAILER">Retailer</option><option value="MANUFACTURER">Manufacturer</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-[var(--oh-text-secondary)]">Official website
          <input required type="url" value={customUrl} onChange={(event) => setCustomUrl(event.target.value)} placeholder="https://example.com.au" className="h-10 rounded-md border border-[var(--oh-border)] px-2 text-sm" />
        </label>
        <button type="submit" disabled={savingId === -1} className="inline-flex min-h-10 items-center justify-center gap-1.5 self-end rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold text-[var(--oh-text)] disabled:opacity-50">
          {savingId === -1 ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />} Add source
        </button>
      </form>
      {sources.some((source) => source.enabled && source.postcode) && <p className="flex items-center gap-1.5 border-t border-[var(--oh-border)] px-4 py-2 text-xs text-[var(--oh-muted)]"><Check size={14} />Competitor comparisons use each source’s configured postcode and fulfilment.</p>}
    </section>
  );
}
