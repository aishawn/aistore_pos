"use client";

import { useState } from "react";
import { RecommendShell } from "@/components/recommend/RecommendShell";
import { ProductRecommendCard } from "@/components/recommend/ProductRecommendCard";
import {
  apiFailureMessage,
  groceryRecommend,
  type GroceryRecommendCard as GroceryCard,
  type GroceryRecommendPayload,
} from "@/lib/api";

type Step = "category" | "budget" | "occasion" | "results";

const STEPS: Step[] = ["category", "budget", "occasion", "results"];

const CATEGORIES = [
  { id: "beer", label: "Beer" },
  { id: "spirits", label: "Spirits" },
  { id: "soft_drinks", label: "Soft drinks" },
  { id: "snacks", label: "Snacks & mixers" },
  { id: "not_sure", label: "Not sure" },
];

const BUDGETS = [
  { id: "u10", label: "Under $10", min: 0, max: 10 },
  { id: "10", label: "$10–30", min: 10, max: 30 },
  { id: "30", label: "$30+", min: 30, max: null },
  { id: "any", label: "No preference", min: null, max: null },
];

const OCCASIONS = [
  { id: "bbq", label: "BBQ" },
  { id: "party", label: "Party" },
  { id: "gift", label: "Gift" },
  { id: "everyday", label: "Everyday" },
  { id: "not_sure", label: "Not sure" },
];

export function GroceryFindPage() {
  const [step, setStep] = useState<Step>("category");
  const [category, setCategory] = useState("not_sure");
  const [budgetMin, setBudgetMin] = useState<number | null>(null);
  const [budgetMax, setBudgetMax] = useState<number | null>(null);
  const [budgetId, setBudgetId] = useState("any");
  const [occasion, setOccasion] = useState("not_sure");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<GroceryCard[]>([]);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);

  const idx = STEPS.indexOf(step);
  const profile: GroceryRecommendPayload = {
    category,
    budgetMin,
    budgetMax,
    occasion,
  };

  function go(next: Step) {
    setError(null);
    setStep(next);
  }

  async function runRecommend() {
    setLoading(true);
    setError(null);
    try {
      const res = await groceryRecommend(profile);
      setCards(res.recommendations ?? []);
      setEmptyReason(res.emptyReason);
      setStep("results");
    } catch (e) {
      setError(apiFailureMessage(e, "Could not recommend products.", "Please sign in again."));
    } finally {
      setLoading(false);
    }
  }

  const title = step === "results" ? "Grocery recommendations" : "Find grocery";
  const subtitle =
    step === "results"
      ? summaryLine(profile)
      : "Answer a few questions to match beer, spirits, snacks, or soft drinks in this store's stock.";

  return (
    <RecommendShell title={title} subtitle={subtitle}>
      {step !== "results" ? (
        <div
          className="mb-5 h-1.5 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-label={`Step ${idx + 1} of ${STEPS.length - 1}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((idx / (STEPS.length - 1)) * 100)}
        >
          <div
            className="h-full rounded-full bg-[var(--oh-primary)] transition-all"
            style={{ width: `${Math.round((idx / (STEPS.length - 1)) * 100)}%` }}
          />
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-900">
          <p>{error}</p>
          <button
            type="button"
            className="mt-2 text-[13px] font-semibold text-red-800 underline"
            onClick={() => void runRecommend()}
          >
            Retry recommendation
          </button>
        </div>
      ) : null}

      {step === "category" ? (
        <StepBlock label="What are they looking for?">
          <ChipGrid
            options={CATEGORIES}
            selected={category}
            onSelect={(id) => {
              setCategory(id);
              go("budget");
            }}
          />
        </StepBlock>
      ) : null}

      {step === "budget" ? (
        <StepBlock label="Budget">
          <ChipGrid
            options={BUDGETS.map((b) => ({ id: b.id, label: b.label }))}
            selected={budgetId}
            onSelect={(id) => {
              const b = BUDGETS.find((x) => x.id === id)!;
              setBudgetId(id);
              setBudgetMin(b.min);
              setBudgetMax(b.max);
              go("occasion");
            }}
          />
          <BackButton onClick={() => go("category")} />
        </StepBlock>
      ) : null}

      {step === "occasion" ? (
        <StepBlock label="Occasion">
          <ChipGrid
            options={OCCASIONS}
            selected={occasion}
            onSelect={(id) => {
              setOccasion(id);
              void (async () => {
                setLoading(true);
                setError(null);
                try {
                  const res = await groceryRecommend({
                    category,
                    budgetMin,
                    budgetMax,
                    occasion: id,
                  });
                  setCards(res.recommendations ?? []);
                  setEmptyReason(res.emptyReason);
                  setStep("results");
                } catch (e) {
                  setError(apiFailureMessage(e, "Could not recommend products.", "Please sign in again."));
                } finally {
                  setLoading(false);
                }
              })();
            }}
          />
          {loading ? <p className="mt-4 text-[13px] text-[var(--oh-muted)]">Matching stock…</p> : null}
          <BackButton onClick={() => go("budget")} />
        </StepBlock>
      ) : null}

      {step === "results" ? (
        <div className="grid gap-4">
          {cards.length === 0 ? (
            <div className="rounded-xl border border-[var(--oh-border)] bg-white p-5 text-[14px] text-[var(--oh-muted)]">
              {emptyReason ?? "No matching in-stock items."}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-[13px] font-semibold text-[var(--oh-primary)]"
                  onClick={() => go("category")}
                >
                  Start over
                </button>
                <button
                  type="button"
                  className="text-[13px] font-semibold text-[var(--oh-primary)]"
                  onClick={() => void runRecommend()}
                >
                  Retry recommendation
                </button>
              </div>
            </div>
          ) : (
            cards.map((card) => <ProductRecommendCard key={card.productId} card={card} />)
          )}
          <button
            type="button"
            className="text-left text-[13px] font-semibold text-[var(--oh-primary)]"
            onClick={() => go("category")}
          >
            Start over
          </button>
        </div>
      ) : null}
    </RecommendShell>
  );
}

function StepBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[16px] font-semibold text-[var(--oh-text)]">{label}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ChipGrid({
  options,
  selected,
  onSelect,
}: {
  options: { id: string; label: string }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            className={`min-h-11 rounded-lg border px-3.5 py-2.5 text-[14px] font-medium transition ${
              active
                ? "border-[var(--oh-primary)] bg-[var(--oh-orange-light)] text-[var(--oh-primary)]"
                : "border-[var(--oh-border)] bg-white text-[var(--oh-text)] hover:border-[var(--oh-primary)]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 text-[13px] font-semibold text-[var(--oh-muted)] hover:text-[var(--oh-text)]"
    >
      Back
    </button>
  );
}

function summaryLine(profile: GroceryRecommendPayload): string {
  const parts: string[] = [];
  if (profile.category && profile.category !== "not_sure") parts.push(profile.category.replace(/_/g, " "));
  if (profile.budgetMin != null || profile.budgetMax != null) {
    if (profile.budgetMax == null && profile.budgetMin != null) parts.push(`from $${profile.budgetMin}`);
    else if (profile.budgetMin == null && profile.budgetMax != null) parts.push(`under $${profile.budgetMax}`);
    else parts.push(`$${profile.budgetMin}–$${profile.budgetMax}`);
  }
  if (profile.occasion && profile.occasion !== "not_sure") parts.push(profile.occasion);
  return parts.length ? parts.join(" · ") : "In-stock matches from this store";
}
