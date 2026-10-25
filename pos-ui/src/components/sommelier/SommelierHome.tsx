"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Camera, Search, Sparkles } from "lucide-react";
import { SommelierShell } from "@/components/sommelier/SommelierShell";
import { useOptionalAiAssistant } from "@/lib/ai-assistant";
import { fetchAiClientConfig } from "@/lib/api";
import { getUiMode } from "@/lib/ui-mode";

export function SommelierHome({ showPosAssistant = false }: { showPosAssistant?: boolean }) {
  const ai = useOptionalAiAssistant();
  const findHref = "/sommelier/find";
  const identifyHref = "/sommelier/identify";
  const mobile = getUiMode() === "mobile";
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [labelVisionAvailable, setLabelVisionAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAiClientConfig()
      .then((config) => {
        if (!cancelled) {
          setAiEnabled(config.enabled);
          setLabelVisionAvailable(config.labelVisionAvailable ?? config.enabled);
        }
      })
      .catch(() => {
        if (!cancelled) setAiEnabled(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SommelierShell
      title="Wine · Recommend"
      subtitle="Help the customer find the right bottle from this store — then help sell it."
    >
      <div className="grid gap-4">
        <p className="text-[13px] text-[var(--oh-muted)]">
          <Link href={mobile ? "/m" : "/recommend"} className="font-semibold text-[var(--oh-primary)]">
            ← All recommendations
          </Link>
          {" "}(Wine and Grocery)
        </p>
        {aiEnabled === false ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] leading-5 text-amber-950">
            Store AI chat and label photos are off. Find a wine still matches this store&apos;s catalogue; name and barcode search still work on Identify.
          </p>
        ) : null}
        <Link
          href={findHref}
          className="group rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)] transition hover:border-[var(--oh-primary)] hover:shadow-md sm:p-6"
        >
          <div className="flex items-center gap-2 text-[var(--oh-primary)]">
            <Sparkles size={20} />
            <span className="text-[13px] font-semibold">Find a wine</span>
          </div>
          <h2 className="mt-3 text-[21px] font-semibold leading-snug text-[var(--oh-text)] sm:text-[23px]">Help me find the right wine for this customer</h2>
          <p className="mt-2 text-[14px] leading-6 text-[var(--oh-muted)]">
            Ask a few questions, then recommend three in-stock options at different prices.
          </p>
        </Link>

        <Link
          href={identifyHref}
          className="group rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)] transition hover:border-[var(--oh-primary)] hover:shadow-md sm:p-6"
        >
          <div className="flex items-center gap-2 text-[var(--oh-primary)]">
            <Camera size={20} />
            <span className="text-[13px] font-semibold">Identify a wine</span>
          </div>
          <h2 className="mt-3 text-[21px] font-semibold leading-snug text-[var(--oh-text)] sm:text-[23px]">Photograph the label or search a bottle</h2>
          <p className="mt-2 text-[14px] leading-6 text-[var(--oh-muted)]">
            {aiEnabled === false
              ? "Search by name or barcode now. Label photos need store AI turned on."
              : labelVisionAvailable === false
                ? "Search by name or barcode now. Label photo recognition is unavailable for this store."
                : "Snap the wine label to match this store's stock, then get tasting notes, pairing, and a sales pitch."}
          </p>
        </Link>

        {showPosAssistant && mobile ? (
          <button
            type="button"
            onClick={() => ai?.setExpanded(true)}
            className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--oh-border)] bg-white px-4 py-3 text-left text-[14px] text-[var(--oh-text)] transition hover:border-[var(--oh-primary)] hover:bg-[var(--oh-orange-light)]"
          >
            <Search size={18} className="text-[var(--oh-muted)]" />
            <span>
              <span className="block font-medium">POS Assistant</span>
              <span className="text-[13px] text-[var(--oh-muted)]">Reports, stock, customers, navigation</span>
            </span>
          </button>
        ) : null}
      </div>
    </SommelierShell>
  );
}
