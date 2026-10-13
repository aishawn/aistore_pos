"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SommelierShell } from "@/components/sommelier/SommelierShell";
import { WineCard } from "@/components/sommelier/WineCard";
import {
  apiFailureMessage,
  sommelierRecommend,
  type SommelierProfilePayload,
  type SommelierRecommendCard,
} from "@/lib/api";

type Step = "type" | "budget" | "dryness" | "body" | "food" | "occasion" | "results";

const STEPS: Step[] = ["type", "budget", "dryness", "body", "food", "occasion", "results"];

const TYPES = [
  { id: "red", label: "Red" },
  { id: "white", label: "White" },
  { id: "rose", label: "Rosé" },
  { id: "sparkling", label: "Sparkling" },
  { id: "champagne", label: "Champagne" },
  { id: "fortified", label: "Fortified" },
  { id: "not_sure", label: "Not sure" },
];

const BUDGETS = [
  { id: "u15", label: "Under $15", min: 0, max: 15 },
  { id: "15", label: "$15–20", min: 15, max: 20 },
  { id: "20", label: "$20–25", min: 20, max: 25 },
  { id: "25", label: "$25–35", min: 25, max: 35 },
  { id: "35", label: "$35–50", min: 35, max: 50 },
  { id: "50", label: "$50+", min: 50, max: null },
  { id: "any", label: "No preference", min: null, max: null },
];

const DRYNESS = [
  { id: "crisp", label: "Fresh / Crisp", value: 0.55 },
  { id: "dry", label: "Dry", value: 0.78 },
  { id: "very", label: "Very Dry", value: 0.92 },
  { id: "fruit", label: "A little fruity", value: 0.48 },
  { id: "sweet", label: "Sweet", value: 0.22 },
  { id: "any", label: "Not sure", value: null },
];

const BODY = [
  { id: "light", label: "Light", value: 0.3 },
  { id: "medium", label: "Medium", value: 0.55 },
  { id: "full", label: "Full Body", value: 0.82 },
  { id: "very", label: "Very Full Body", value: 0.95 },
  { id: "any", label: "Not sure", value: null },
];

const FOODS = [
  { id: "steak", label: "🥩 Steak" },
  { id: "lamb", label: "🍖 Lamb" },
  { id: "chicken", label: "🍗 Chicken" },
  { id: "fish", label: "🐟 Fish" },
  { id: "seafood", label: "🦐 Seafood" },
  { id: "pasta", label: "🍝 Pasta" },
  { id: "pizza", label: "🍕 Pizza" },
  { id: "cheese", label: "🧀 Cheese" },
  { id: "spicy", label: "🌶 Spicy" },
  { id: "asian", label: "🍛 Asian" },
  { id: "bbq", label: "🔥 BBQ" },
];

const OCCASIONS = [
  { id: "dinner", label: "Dinner tonight" },
  { id: "gift", label: "Gift" },
  { id: "date", label: "Date night" },
  { id: "party", label: "Party" },
  { id: "bbq", label: "BBQ" },
  { id: "relaxing", label: "Relaxing at home" },
  { id: "special", label: "Special occasion" },
  { id: "exploring", label: "Just exploring" },
];

export function SommelierFindPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("type");
  const [wineType, setWineType] = useState("not_sure");
  const [budgetMin, setBudgetMin] = useState<number | null>(15);
  const [budgetMax, setBudgetMax] = useState<number | null>(25);
  const [budgetId, setBudgetId] = useState("20");
  const [dryness, setDryness] = useState<number | null>(0.78);
  const [body, setBody] = useState<number | null>(0.82);
  const [food, setFood] = useState<string[]>([]);
  const [foodOther, setFoodOther] = useState("");
  const [occasion, setOccasion] = useState<string | null>("dinner");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<SommelierRecommendCard[]>([]);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);

  const idx = STEPS.indexOf(step);
  const profile: SommelierProfilePayload = {
    wineType,
    budgetMin,
    budgetMax,
    dryness,
    body,
    food: foodOther.trim() ? [...food, foodOther.trim()] : food,
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
      const res = await sommelierRecommend(profile);
      setCards(res.recommendations ?? []);
      setEmptyReason(res.emptyReason);
      setStep("results");
    } catch (e) {
      setError(apiFailureMessage(e, "Could not recommend wines.", "Please sign in again."));
    } finally {
      setLoading(false);
    }
  }

  function toggleFood(id: string) {
    setFood((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const title =
    step === "results"
      ? "Orion Recommendation"
      : "Find a wine";
  const subtitle =
    step === "results"
      ? summaryLine(profile)
      : "Answer a few questions to match wines currently listed in this store's catalogue.";

  return (
    <SommelierShell title={title} subtitle={subtitle}>
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

      {step === "type" && (
        <StepFrame question="What are you looking for?" onNext={() => go("budget")}>
          <ChoiceGrid
            options={TYPES}
            value={wineType}
            onChange={setWineType}
          />
        </StepFrame>
      )}

      {step === "budget" && (
        <StepFrame question="What's your budget?" onBack={() => go("type")} onNext={() => go("dryness")}>
          <ChoiceGrid
            options={BUDGETS.map((b) => ({ id: b.id, label: b.label }))}
            value={budgetId}
            onChange={(id) => {
              const b = BUDGETS.find((x) => x.id === id);
              setBudgetId(id);
              setBudgetMin(b?.min ?? null);
              setBudgetMax(b?.max ?? null);
            }}
          />
        </StepFrame>
      )}

      {step === "dryness" && (
        <StepFrame question="How dry do you like your wine?" onBack={() => go("budget")} onNext={() => go("body")}>
          <ChoiceGrid
            options={DRYNESS.map((d) => ({ id: d.id, label: d.label }))}
            value={DRYNESS.find((d) => d.value === dryness)?.id ?? "any"}
            onChange={(id) => setDryness(DRYNESS.find((d) => d.id === id)?.value ?? null)}
          />
        </StepFrame>
      )}

      {step === "body" && (
        <StepFrame question="How much body do you like?" onBack={() => go("dryness")} onNext={() => go("food")}>
          <ChoiceGrid
            options={BODY.map((d) => ({ id: d.id, label: d.label }))}
            value={BODY.find((d) => d.value === body)?.id ?? "any"}
            onChange={(id) => setBody(BODY.find((d) => d.id === id)?.value ?? null)}
          />
        </StepFrame>
      )}

      {step === "food" && (
        <StepFrame question="What are you having it with?" onBack={() => go("body")} onNext={() => go("occasion")}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FOODS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleFood(f.id)}
                className={chipClass(food.includes(f.id))}
              >
                {f.label}
              </button>
            ))}
            <button type="button" onClick={() => setFood([])} className={chipClass(food.length === 0 && !foodOther)}>
              🍽 No food
            </button>
          </div>
          <input
            value={foodOther}
            onChange={(e) => setFoodOther(e.target.value)}
            placeholder="Other, e.g. Chinese BBQ"
            className="mt-3 min-h-11 w-full rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2.5 text-[14px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-blue-100"
          />
        </StepFrame>
      )}

      {step === "occasion" && (
        <StepFrame
          question="What's the occasion?"
          onBack={() => go("food")}
          nextLabel={loading ? "Matching stock…" : "Recommend"}
          onNext={() => void runRecommend()}
          nextDisabled={loading}
        >
          <ChoiceGrid
            options={OCCASIONS}
            value={occasion ?? "dinner"}
            onChange={setOccasion}
          />
        </StepFrame>
      )}

      {step === "results" && (
        <div className="space-y-4">
          {emptyReason && cards.length === 0 ? (
            <p className="rounded-xl border border-[var(--oh-border)] bg-white p-4 text-[14px] text-[var(--oh-text)]">{emptyReason}</p>
          ) : null}
          {cards.map((card) => (
            <WineCard
              key={card.productId}
              card={card}
              onHelp={() => router.push(`/sommelier/wine/${card.productId}`)}
            />
          ))}
          <button
            type="button"
            onClick={() => go("type")}
            className="min-h-11 w-full rounded-lg border border-[var(--oh-border)] bg-white py-2.5 text-[14px] font-medium text-[var(--oh-text)] hover:bg-slate-50"
          >
            Start over
          </button>
        </div>
      )}

      {error ? <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p> : null}
    </SommelierShell>
  );
}

function summaryLine(profile: SommelierProfilePayload) {
  const bits = [
    profile.wineType && profile.wineType !== "not_sure" ? titleCase(profile.wineType) : null,
    profile.dryness != null && profile.dryness >= 0.75 ? "Dry" : null,
    profile.body != null && profile.body >= 0.75 ? "Full Body" : null,
    profile.food?.[0] ? titleCase(profile.food[0]) : null,
    profile.budgetMin != null || profile.budgetMax != null
      ? `$${profile.budgetMin ?? 0}–${profile.budgetMax ?? "50+"}`
      : null,
  ].filter(Boolean);
  return `Based on your customer: ${bits.join(" · ")}`;
}

function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function chipClass(active: boolean) {
  return [
    "rounded-xl border px-3 py-3 text-left text-[14px] transition",
    active
      ? "border-[var(--oh-primary)] bg-blue-50 text-blue-800 ring-1 ring-blue-100"
      : "border-[var(--oh-border)] bg-white text-[var(--oh-text)] hover:border-blue-300 hover:bg-slate-50",
  ].join(" ");
}

function ChoiceGrid({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} className={chipClass(o.id === value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StepFrame({
  question,
  children,
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled,
}: {
  question: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div>
      <h2 className="mb-4 text-[20px] font-medium">{question}</h2>
      {children}
      <div className="mt-6 flex gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-4 py-2.5 text-[14px] font-medium text-[var(--oh-text)] hover:bg-slate-50"
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          disabled={nextDisabled}
          onClick={onNext}
          className="min-h-11 flex-1 rounded-lg bg-[var(--oh-primary)] px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:opacity-60"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
