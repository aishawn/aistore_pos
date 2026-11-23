"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SommelierShell } from "@/components/sommelier/SommelierShell";
import { WineCard, formatMoney } from "@/components/sommelier/WineCard";
import { useOptionalSellScreen } from "@/lib/sell-screen";
import { RefreshIcon } from "@/components/icons";
import {
  apiFailureMessage,
  sommelierAsk,
  sommelierFeedback,
  sommelierPitch,
  sommelierSimilar,
  sommelierWine,
  type SommelierRecommendCard,
  type SommelierWine,
} from "@/lib/api";

export function SommelierWinePage({ productId }: { productId: string }) {
  const router = useRouter();
  const sell = useOptionalSellScreen();
  const [wine, setWine] = useState<SommelierWine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pitch, setPitch] = useState<"10s" | "30s" | null>(null);
  const [livePitch, setLivePitch] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [alts, setAlts] = useState<SommelierRecommendCard[]>([]);
  const [altsLabel, setAltsLabel] = useState<string | null>(null);
  const [askHint, setAskHint] = useState<string | null>(null);
  const [busy, setBusy] = useState<"ask" | "cheaper" | "upgrade" | "pitch" | null>(null);
  const [reaction, setReaction] = useState<"liked" | "rejected" | null>(null);
  const [reactionNote, setReactionNote] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const altsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    setLivePitch(null);
    setPitch(null);
    setAnswer(null);
    setAlts([]);
    setAltsLabel(null);
    setAskHint(null);
    setReaction(null);
    setReactionNote(null);
    sommelierWine(productId)
      .then((data) => {
        if (alive) setWine(data);
      })
      .catch((e) => {
        if (alive) setError(apiFailureMessage(e, "Could not load this wine.", "Please sign in again."));
      });
    return () => {
      alive = false;
    };
  }, [productId, retryKey]);

  async function refreshPitch(length: "10s" | "30s") {
    setPitch(length);
    setBusy("pitch");
    try {
      const res = await sommelierPitch(Number(productId), length);
      setLivePitch(res.text);
    } catch {
      setLivePitch(null);
    } finally {
      setBusy(null);
    }
  }

  async function loadSimilar(direction: "cheaper" | "upgrade") {
    setBusy(direction);
    setError(null);
    setAltsLabel(direction === "cheaper" ? "Looking for cheaper matches…" : "Looking for a step-up…");
    try {
      const res = await sommelierSimilar(Number(productId), direction);
      const items = res.items ?? [];
      setAlts(items);
      setAltsLabel(
        direction === "cheaper"
          ? items.length
            ? `Similar style, lower price · ${items.length} in stock`
            : "No cheaper in-stock bottle in the same style."
          : items.length
            ? `Same style, higher price · ${items.length} in stock`
            : "No higher-priced in-stock bottle in the same style.",
      );
      requestAnimationFrame(() => {
        altsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } catch (e) {
      setAlts([]);
      setAltsLabel(null);
      setError(apiFailureMessage(e, "Could not find alternatives.", "Please sign in again."));
    } finally {
      setBusy(null);
    }
  }

  async function ask(raw?: string) {
    const text = (raw ?? question).trim();
    if (!text) {
      setAskHint("Type the customer's question first — or tap a suggestion below.");
      return;
    }
    setQuestion(text);
    setAskHint(null);
    setBusy("ask");
    setError(null);
    try {
      const res = await sommelierAsk(Number(productId), text);
      setAnswer(res.answer);
      setAlts(res.alternatives ?? []);
      setAltsLabel(res.alternatives?.length ? `Suggested alternatives · ${res.alternatives.length} in stock` : null);
    } catch (e) {
      setError(apiFailureMessage(e, "Could not answer that.", "Please sign in again."));
    } finally {
      setBusy(null);
    }
  }

  async function recordReaction(next: "liked" | "rejected") {
    if (!wine) return;
    setReactionNote(null);
    try {
      await sommelierFeedback(wine.productId, next);
      setReaction(next);
      setReactionNote(
        next === "liked"
          ? "Saved. This bottle was a good match for the customer."
          : "Saved. We'll avoid pushing this style next time.",
      );
    } catch (e) {
      setReactionNote(apiFailureMessage(e, "Could not save that reaction.", "Please sign in again."));
    }
  }

  function addToCart() {
    if (!wine) return;
    sell?.addProduct({
      id: String(wine.productId),
      name: wine.name,
      unitPrice: Number(wine.sellPrice),
      caseQuantity: wine.caseQuantity && wine.caseQuantity > 0 ? Number(wine.caseQuantity) : undefined,
    });
    void sommelierFeedback(wine.productId, "bought").catch(() => undefined);
    router.push("/");
  }

  if (error && !wine) {
    return (
      <SommelierShell title="Product assistant">
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-700">
          <span className="min-w-0">{error}</span>
          <button
            type="button"
            onClick={() => setRetryKey((value) => value + 1)}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-rose-300 bg-[var(--oh-surface-elevated)] px-3 font-semibold"
          >
            <RefreshIcon size={14} /> Retry
          </button>
        </div>
      </SommelierShell>
    );
  }

  if (!wine) {
    return (
      <SommelierShell title="Product assistant">
        <p role="status" className="text-[14px] text-[var(--oh-muted)]">Loading this bottle…</p>
      </SommelierShell>
    );
  }

  const spoken = livePitch
    ?? (pitch === "30s" ? wine.pitch30s : pitch === "10s" ? wine.pitch10s : wine.pitch);

  return (
    <SommelierShell title={wine.name} subtitle={[wine.varietal, wine.vintage, wine.region].filter(Boolean).join(" · ")}>
      <div className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[28px] font-semibold leading-none text-[var(--oh-text)]">A${formatMoney(wine.sellPrice).slice(1)}</p>
            <p className="mt-1 text-xs text-[var(--oh-muted)]">Per unit · AUD · GST included</p>
            {wine.onPromotion ? (
              <p className="mt-1 text-[13px] text-amber-700">On promotion · normally A${formatMoney(wine.listPrice).slice(1)}</p>
            ) : null}
            {wine.onPromotion ? <p className="text-xs text-[var(--oh-muted)]">{wine.promotionEndsAt ? `Offer ends ${wine.promotionEndsAt}` : "Promotion end date unverified"}</p> : null}
          </div>
          <p className="text-[13px] text-[var(--oh-muted)]">
            In stock: {wine.stockQuantity} units
            {Number(wine.caseQuantity) > 1 ? ` · Case pack: ${Number(wine.caseQuantity).toLocaleString("en-AU")} units` : ""}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
          <Chip>{wine.drynessLabel}</Chip>
          <Chip>{wine.bodyLabel}</Chip>
          {wine.palateTags.slice(0, 3).map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </div>
      </div>

      {wine.inferred ? (
        <p className="mt-3 text-[12px] font-medium text-amber-800">
          Some wine details may be estimated from the product listing. Check varietal, region and vintage on the bottle; tasting notes and pairings are suggestions.
        </p>
      ) : null}

      <section className="mt-5">
        <h2 className="text-[14px] font-semibold text-[var(--oh-text)]">Tasting notes</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {wine.aromaTags.map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </div>
        {wine.finishNote ? <p className="mt-2 text-[13px] text-[var(--oh-text-secondary)]">{wine.finishNote}</p> : null}
      </section>

      <section className="mt-5">
        <h2 className="text-[14px] font-semibold text-[var(--oh-text)]">Food pairing</h2>
        <p className="mt-2 text-[14px] text-[var(--oh-text-secondary)]">{wine.foodTags.length ? wine.foodTags.join(" · ") : "Flexible with dinner"}</p>
      </section>

      <section className="mt-5 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[14px] font-semibold text-[var(--oh-primary)]">How to sell</h2>
          <div className="flex gap-1">
            <MiniToggle active={pitch === "10s"} onClick={() => void refreshPitch("10s")}>10s</MiniToggle>
            <MiniToggle active={pitch === "30s"} onClick={() => void refreshPitch("30s")}>30s</MiniToggle>
          </div>
        </div>
        <p className="mt-2 text-[15px] leading-6 text-[var(--oh-text)]">{spoken}</p>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={addToCart}
          className="min-h-11 rounded-lg bg-[var(--oh-primary)] px-3 py-2.5 text-[14px] font-semibold text-white hover:bg-[var(--oh-primary-hover)]"
        >
          Add to cart
        </button>
        <button
          type="button"
          onClick={() => void refreshPitch(pitch === "30s" ? "10s" : "30s")}
          className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2.5 text-[14px] font-semibold text-[var(--oh-text)] hover:bg-slate-50"
        >
          Help me sell this
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void loadSimilar("cheaper")}
          className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] py-2 text-[14px] font-medium text-[var(--oh-text)] hover:bg-slate-50 disabled:opacity-60"
        >
          {busy === "cheaper" ? "Looking…" : "Similar but cheaper"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void loadSimilar("upgrade")}
          className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] py-2 text-[14px] font-medium text-[var(--oh-text)] hover:bg-slate-50 disabled:opacity-60"
        >
          {busy === "upgrade" ? "Looking…" : "Something better"}
        </button>
      </div>

      {altsLabel || alts.length > 0 ? (
        <div ref={altsRef} className="mt-3 space-y-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3">
          <p className="text-[13px] font-medium text-[var(--oh-primary)]">{altsLabel}</p>
          {alts.length > 0 ? (
            alts.map((card) => (
              <WineCard key={card.productId} card={card} onHelp={() => router.push(`/sommelier/wine/${card.productId}`)} />
            ))
          ) : busy === "cheaper" || busy === "upgrade" ? (
            <p className="text-[13px] text-[var(--oh-muted)]">Checking this store&apos;s stock…</p>
          ) : (
            <p className="text-[13px] text-[var(--oh-muted)]">Try a different bottle, or ask in the box below.</p>
          )}
        </div>
      ) : null}

      <form
        className="mt-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <input
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            if (askHint) setAskHint(null);
          }}
          placeholder="Type the customer's question"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2.5 text-[14px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-blue-100"
        />
        <button
          type="submit"
          disabled={busy !== null}
          className="min-h-11 rounded-lg bg-[var(--oh-primary)] px-3 text-[14px] font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:opacity-60"
        >
          {busy === "ask" ? "…" : "Ask"}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {["Is this sweet?", "What food does it go with?", "Anything similar but cheaper?"].map((q) => (
          <button
            key={q}
            type="button"
            disabled={busy !== null}
            onClick={() => void ask(q)}
            className="min-h-9 rounded-full border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-2.5 py-1 text-[13px] text-[var(--oh-text-secondary)] hover:border-[var(--oh-primary)] hover:text-[var(--oh-primary)] disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>
      {askHint ? <p className="mt-2 text-[13px] text-amber-700">{askHint}</p> : null}

      {answer ? <p className="mt-3 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2 text-[14px] leading-6 text-[var(--oh-text)]">{answer}</p> : null}
      {error ? <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p> : null}


      <div className="mt-6">
        <p className="text-[14px] font-semibold text-[var(--oh-text)]">Customer reaction</p>
        <p className="mt-1 text-[13px] text-[var(--oh-muted)]">Did the customer like this bottle? This trains later recommendations.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void recordReaction("liked")}
            className={`rounded-full border px-3 py-1.5 text-[13px] ${
              reaction === "liked"
                ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                : "border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] text-[var(--oh-text)]"
            }`}
          >
            Liked
          </button>
          <button
            type="button"
            onClick={() => void recordReaction("rejected")}
            className={`rounded-full border px-3 py-1.5 text-[13px] ${
              reaction === "rejected"
                ? "border-rose-600 bg-rose-50 text-rose-800"
                : "border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] text-[var(--oh-text)]"
            }`}
          >
            Rejected
          </button>
        </div>
        {reactionNote ? (
          <p className={`mt-2 text-[13px] ${reaction ? "text-emerald-700" : "text-rose-700"}`}>{reactionNote}</p>
        ) : null}
      </div>
    </SommelierShell>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <span className="rounded-full border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-2.5 py-1 text-[13px] text-[var(--oh-text-secondary)]">{children}</span>;
}

function MiniToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 rounded-md px-2 py-1 text-[13px] font-semibold ${active ? "bg-[var(--oh-primary)] text-white" : "bg-[var(--oh-surface-elevated)] text-[var(--oh-text-secondary)] hover:bg-slate-100"}`}
    >
      {children}
    </button>
  );
}
