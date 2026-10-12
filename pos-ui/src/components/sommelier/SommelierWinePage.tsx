"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SommelierShell } from "@/components/sommelier/SommelierShell";
import { WineCard, formatMoney } from "@/components/sommelier/WineCard";
import { useOptionalSellScreen } from "@/lib/sell-screen";
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
  const altsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
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
  }, [productId]);

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
        <p className="text-[14px] text-rose-300">{error}</p>
      </SommelierShell>
    );
  }

  if (!wine) {
    return (
      <SommelierShell title="Product assistant">
        <p className="text-[14px] text-white/60">Loading this bottle…</p>
      </SommelierShell>
    );
  }

  const spoken = livePitch
    ?? (pitch === "30s" ? wine.pitch30s : pitch === "10s" ? wine.pitch10s : wine.pitch);

  return (
    <SommelierShell title={wine.name} subtitle={[wine.varietal, wine.vintage, wine.region].filter(Boolean).join(" · ")}>
      <div className="rounded-2xl border border-white/12 bg-white/5 p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[28px] font-medium leading-none">{formatMoney(wine.sellPrice)}</p>
            {wine.onPromotion ? (
              <p className="mt-1 text-[12px] text-amber-300">On promotion · normally {formatMoney(wine.listPrice)}</p>
            ) : null}
          </div>
          <p className="text-[13px] text-white/55">In stock: {wine.stockQuantity}</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
          <Chip>{wine.drynessLabel}</Chip>
          <Chip>{wine.bodyLabel}</Chip>
          {wine.palateTags.slice(0, 3).map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </div>
      </div>

      <section className="mt-5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/45">Tasting notes</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {wine.aromaTags.map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </div>
        {wine.finishNote ? <p className="mt-2 text-[13px] text-white/70">{wine.finishNote}</p> : null}
      </section>

      <section className="mt-5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/45">Food pairing</h2>
        <p className="mt-2 text-[14px] text-white/80">{wine.foodTags.length ? wine.foodTags.join(" · ") : "Flexible with dinner"}</p>
      </section>

      <section className="mt-5 rounded-2xl border border-[#f39200]/30 bg-[#f39200]/10 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#f39200]">How to sell</h2>
          <div className="flex gap-1">
            <MiniToggle active={pitch === "10s"} onClick={() => void refreshPitch("10s")}>10s</MiniToggle>
            <MiniToggle active={pitch === "30s"} onClick={() => void refreshPitch("30s")}>30s</MiniToggle>
          </div>
        </div>
        <p className="mt-2 text-[15px] leading-6 text-white">{spoken}</p>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={addToCart}
          className="rounded-xl bg-[#f39200] px-3 py-2.5 text-[13px] font-semibold text-[#1a1020]"
        >
          Add to cart
        </button>
        <button
          type="button"
          onClick={() => void refreshPitch(pitch === "30s" ? "10s" : "30s")}
          className="rounded-xl border border-white/15 px-3 py-2.5 text-[13px] font-semibold"
        >
          Help me sell this
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void loadSimilar("cheaper")}
          className="rounded-xl border border-white/15 py-2 text-[13px] disabled:opacity-60"
        >
          {busy === "cheaper" ? "Looking…" : "Similar but cheaper"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void loadSimilar("upgrade")}
          className="rounded-xl border border-white/15 py-2 text-[13px] disabled:opacity-60"
        >
          {busy === "upgrade" ? "Looking…" : "Something better"}
        </button>
      </div>

      {altsLabel || alts.length > 0 ? (
        <div ref={altsRef} className="mt-3 space-y-3 rounded-2xl border border-[#f39200]/35 bg-[#f39200]/10 p-3">
          <p className="text-[13px] font-medium text-[#f39200]">{altsLabel}</p>
          {alts.length > 0 ? (
            alts.map((card) => (
              <WineCard key={card.productId} card={card} onHelp={() => router.push(`/sommelier/wine/${card.productId}`)} />
            ))
          ) : busy === "cheaper" || busy === "upgrade" ? (
            <p className="text-[13px] text-white/70">Checking this store's stock…</p>
          ) : (
            <p className="text-[13px] text-white/70">Try a different bottle, or ask in the box below.</p>
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
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-[14px] outline-none placeholder:text-white/35 focus:border-[#f39200]"
        />
        <button
          type="submit"
          disabled={busy !== null}
          className="rounded-xl bg-[#f39200] px-3 text-[13px] font-semibold text-[#1a1020] disabled:opacity-60"
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
            className="rounded-full border border-white/15 px-2.5 py-1 text-[12px] text-white/75 disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>
      {askHint ? <p className="mt-2 text-[13px] text-amber-200">{askHint}</p> : null}

      {answer ? <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-[14px] leading-6 text-white/85">{answer}</p> : null}
      {error ? <p className="mt-3 text-[13px] text-rose-300">{error}</p> : null}


      <div className="mt-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/45">Customer reaction</p>
        <p className="mt-1 text-[12px] text-white/50">Did the customer like this bottle? This trains later recommendations.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void recordReaction("liked")}
            className={`rounded-full border px-3 py-1.5 text-[13px] ${
              reaction === "liked"
                ? "border-emerald-400 bg-emerald-400/20 text-emerald-200"
                : "border-white/15 text-white/80"
            }`}
          >
            Liked
          </button>
          <button
            type="button"
            onClick={() => void recordReaction("rejected")}
            className={`rounded-full border px-3 py-1.5 text-[13px] ${
              reaction === "rejected"
                ? "border-rose-400 bg-rose-400/20 text-rose-200"
                : "border-white/15 text-white/80"
            }`}
          >
            Rejected
          </button>
        </div>
        {reactionNote ? (
          <p className={`mt-2 text-[13px] ${reaction ? "text-emerald-200" : "text-rose-300"}`}>{reactionNote}</p>
        ) : null}
      </div>
    </SommelierShell>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <span className="rounded-full bg-white/8 px-2.5 py-1 text-[12px] text-white/85">{children}</span>;
}

function MiniToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${active ? "bg-[#f39200] text-[#1a1020]" : "bg-white/10 text-white/70"}`}
    >
      {children}
    </button>
  );
}
