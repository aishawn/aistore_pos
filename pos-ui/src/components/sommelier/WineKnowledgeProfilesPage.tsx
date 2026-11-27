"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { SommelierShell } from "@/components/sommelier/SommelierShell";
import {
  apiFailureMessage,
  listWineKnowledgeProfiles,
  reviewWineKnowledgeProfile,
  searchWineProfileProducts,
  submitWineKnowledgeProfile,
  type WineKnowledgeProfile,
  type WineProfileProductOption,
} from "@/lib/api";

type Status = WineKnowledgeProfile["status"];
const FIELDS = ["wine_type", "varietal", "region", "vintage", "dryness", "body", "aroma_tags", "food_tags"] as const;

export function WineKnowledgeProfilesPage() {
  const [status, setStatus] = useState<Status>("PENDING");
  const [profiles, setProfiles] = useState<WineKnowledgeProfile[]>([]);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<WineProfileProductOption[]>([]);
  const [selected, setSelected] = useState<WineProfileProductOption | null>(null);
  const [claims, setClaims] = useState<Record<string, string>>({});
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [licenseBasis, setLicenseBasis] = useState("");
  const [confidence, setConfidence] = useState("0.8");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh(nextStatus = status) {
    const response = await listWineKnowledgeProfiles(nextStatus);
    setProfiles(response.items ?? []);
  }

  useEffect(() => {
    void listWineKnowledgeProfiles("PENDING")
      .then((response) => setProfiles(response.items ?? []))
      .catch((e) => setError(apiFailureMessage(e, "Could not load wine profiles.", "Please sign in again.")));
  }, []);

  async function searchProducts(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setProducts(await searchWineProfileProducts(query.trim()));
    } catch (e) {
      setError(apiFailureMessage(e, "Could not search this store's products.", "Please sign in again."));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const submittedClaims = FIELDS.flatMap((field) => {
        const raw = claims[field]?.trim();
        if (!raw) return [];
        const value = field === "dryness" || field === "body"
          ? Number(raw)
          : field.endsWith("_tags")
            ? raw.split(",").map((item) => item.trim()).filter(Boolean)
            : raw;
        return [{ field, value, sourceName: sourceName.trim(), ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}), licenseBasis: licenseBasis.trim(), confidence: Number(confidence) }];
      });
      if (!submittedClaims.length) throw new Error("Enter at least one wine attribute.");
      await submitWineKnowledgeProfile({
        productId: selected.productId,
        ...(selected.gtin ? { gtin: selected.gtin } : {}),
        productName: selected.name,
        ...(selected.brandName ? { brandName: selected.brandName } : {}),
        claims: submittedClaims,
      });
      setSelected(null);
      setClaims({});
      setProducts([]);
      setNotice("Profile submitted for review.");
      await refresh();
    } catch (e) {
      setError(apiFailureMessage(e, "Could not submit this profile.", "Please sign in again."));
    } finally {
      setBusy(false);
    }
  }

  async function review(profile: WineKnowledgeProfile, decision: "APPROVE" | "REJECT" | "REVOKE") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await reviewWineKnowledgeProfile(profile.id, decision, reason.trim() || undefined);
      setNotice(`Profile ${decision.toLowerCase()}d.`);
      await refresh();
    } catch (e) {
      setError(apiFailureMessage(e, "Could not update this profile.", "Please sign in again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SommelierShell title="Wine knowledge" subtitle="Submit sourced wine facts and review profiles for this store catalogue.">
      <div className="space-y-6">
        <section className="border-b border-[var(--oh-border)] pb-6">
          <h2 className="text-[16px] font-semibold">Add a wine profile</h2>
          <form onSubmit={searchProducts} className="mt-3 flex gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} minLength={2} required placeholder="Search in-stock wines by name or barcode" className={inputClass} />
            <button type="submit" disabled={busy} title="Search products" aria-label="Search products" className={iconButton}><Search size={18} /></button>
          </form>
          {products.length ? <div className="mt-2 max-h-48 overflow-auto border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]">
            {products.map((product) => <button type="button" key={product.productId} onClick={() => { setSelected(product); setProducts([]); }} className="block w-full border-b border-[var(--oh-border)] px-3 py-2 text-left text-[13px] hover:bg-slate-50">
              <span className="font-medium">{product.name}</span><span className="ml-2 text-[var(--oh-muted)]">{[product.brandName, product.gtin].filter(Boolean).join(" · ")}</span>
            </button>)}
          </div> : null}
          {selected ? <form onSubmit={submit} className="mt-4 space-y-3">
            <p className="text-[14px] font-medium">{selected.name}{selected.brandName ? ` · ${selected.brandName}` : ""}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {FIELDS.map((field) => <label key={field} className="text-[12px] text-[var(--oh-muted)]">
                {field.replaceAll("_", " ")}
                <input value={claims[field] ?? ""} onChange={(e) => setClaims((old) => ({ ...old, [field]: e.target.value }))} type={field === "dryness" || field === "body" ? "number" : "text"} min={field === "dryness" || field === "body" ? 0 : undefined} max={field === "dryness" || field === "body" ? 1 : undefined} step={field === "dryness" || field === "body" ? 0.05 : undefined} placeholder={field.endsWith("_tags") ? "Comma-separated" : ""} className={`${inputClass} mt-1`} />
              </label>)}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={sourceName} onChange={(e) => setSourceName(e.target.value)} required placeholder="Source name" className={inputClass} />
              <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} type="url" placeholder="Source URL (HTTPS)" className={inputClass} />
            </div>
            <input value={licenseBasis} onChange={(e) => setLicenseBasis(e.target.value)} required placeholder="Permission or licence basis" className={inputClass} />
            <label className="block text-[12px] text-[var(--oh-muted)]">Source confidence
              <input value={confidence} onChange={(e) => setConfidence(e.target.value)} type="number" min="0" max="1" step="0.05" required className={`${inputClass} mt-1`} />
            </label>
            <button disabled={busy} className="min-h-10 rounded-md bg-[var(--oh-primary)] px-4 text-[13px] font-semibold text-white disabled:opacity-50">Submit for review</button>
          </form> : null}
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold">Profile review</h2>
            <select value={status} onChange={(e) => { const next = e.target.value as Status; setStatus(next); void refresh(next).catch((err) => setError(apiFailureMessage(err, "Could not load profiles.", "Please sign in again."))); }} className={inputClass + " w-auto"}>
              {(["PENDING", "APPROVED", "REJECTED", "REVOKED"] as Status[]).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Review note (optional)" className={`${inputClass} mt-3`} />
          <div className="mt-3 divide-y divide-[var(--oh-border)] border-y border-[var(--oh-border)]">
            {profiles.map((profile) => <article key={profile.id} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[14px] font-semibold">{profile.productName}</h3>
                  <p className="mt-1 text-[12px] text-[var(--oh-muted)]">{profile.brandName ?? ""}{profile.gtin ? ` · ${profile.gtin}` : ""} · {profile.status}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[var(--oh-text-secondary)]">
                    {Object.entries(claimValues(profile.claims)).map(([field, value]) => <span key={field}><b>{field.replaceAll("_", " ")}:</b> {value}</span>)}
                  </div>
                  {profile.reviewReason ? <p className="mt-2 text-[12px] text-[var(--oh-muted)]">{profile.reviewReason}</p> : null}
                </div>
                <div className="flex gap-2">
                  {profile.status === "PENDING" ? <>
                    <button type="button" disabled={busy} onClick={() => void review(profile, "APPROVE")} title="Approve profile" aria-label="Approve profile" className={iconButton}><Check size={17} /></button>
                    <button type="button" disabled={busy} onClick={() => void review(profile, "REJECT")} title="Reject profile" aria-label="Reject profile" className={iconButton}><X size={17} /></button>
                  </> : profile.status === "APPROVED" ? <button type="button" disabled={busy} onClick={() => void review(profile, "REVOKE")} className="min-h-9 rounded-md border border-[var(--oh-border)] px-3 text-[12px]">Revoke</button> : null}
                </div>
              </div>
            </article>)}
            {!profiles.length ? <p className="py-5 text-[13px] text-[var(--oh-muted)]">No {status.toLowerCase()} profiles.</p> : null}
          </div>
        </section>
        {notice ? <p role="status" className="text-[13px] text-emerald-800">{notice}</p> : null}
        {error ? <p role="alert" className="text-[13px] text-rose-700">{error}</p> : null}
      </div>
    </SommelierShell>
  );
}

function claimValues(claims: WineKnowledgeProfile["claims"]): Record<string, string> {
  if (Array.isArray(claims)) {
    return Object.fromEntries((claims as unknown as Array<{ field: string; value: unknown }>).map((claim) => [claim.field, formatClaim(claim.value)]));
  }
  return Object.fromEntries(Object.entries(claims ?? {}).map(([field, claim]) => [field, formatClaim(claim.value)]));
}

function formatClaim(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

const inputClass = "min-h-10 w-full rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2 text-[13px] text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)]";
const iconButton = "grid size-10 shrink-0 place-items-center rounded-md border border-[var(--oh-border)] text-[var(--oh-text)] hover:bg-slate-50 disabled:opacity-50";
