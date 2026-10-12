"use client";

import Link from "next/link";
import { Camera, Search, Sparkles } from "lucide-react";
import { SommelierShell } from "@/components/sommelier/SommelierShell";
import { useOptionalAiAssistant } from "@/lib/ai-assistant";
import { getUiMode } from "@/lib/ui-mode";

export function SommelierHome({ showPosAssistant = false }: { showPosAssistant?: boolean }) {
  const ai = useOptionalAiAssistant();
  const findHref = "/sommelier/find";
  const identifyHref = "/sommelier/identify";
  const mobile = getUiMode() === "mobile";

  return (
    <SommelierShell
      title="Orion Sommelier"
      subtitle="Help the customer find the right bottle from this store — then help sell it."
    >
      <div className="grid gap-4">
        <Link
          href={findHref}
          className="group rounded-2xl border border-white/12 bg-gradient-to-br from-[#4a1630] to-[#2a0f1c] p-6 shadow-lg transition hover:border-[#f39200]/70"
        >
          <div className="flex items-center gap-3 text-[#f39200]">
            <Sparkles size={22} />
            <span className="text-[12px] font-semibold uppercase tracking-[0.18em]">Find a wine</span>
          </div>
          <h2 className="mt-4 text-[26px] font-medium leading-tight">Help me find the right wine for this customer</h2>
          <p className="mt-2 text-[14px] leading-6 text-white/70">
            Ask a few questions, then recommend three in-stock options at different prices.
          </p>
        </Link>

        <Link
          href={identifyHref}
          className="group rounded-2xl border border-white/12 bg-gradient-to-br from-[#1c2744] to-[#12182c] p-6 shadow-lg transition hover:border-white/40"
        >
          <div className="flex items-center gap-3 text-sky-300">
            <Camera size={22} />
            <span className="text-[12px] font-semibold uppercase tracking-[0.18em]">Identify a wine</span>
          </div>
          <h2 className="mt-4 text-[26px] font-medium leading-tight">Photograph the label or search a bottle</h2>
          <p className="mt-2 text-[14px] leading-6 text-white/70">
            Snap the wine label to match this store&apos;s stock, then get tasting notes, pairing, and a sales pitch.
          </p>
        </Link>

        {showPosAssistant && mobile ? (
          <button
            type="button"
            onClick={() => ai?.setExpanded(true)}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left text-[14px] text-white/80 transition hover:bg-white/8"
          >
            <Search size={18} className="text-white/60" />
            <span>
              <span className="block font-medium text-white">POS Assistant</span>
              <span className="text-[12px] text-white/55">Reports, stock, customers, navigation</span>
            </span>
          </button>
        ) : null}
      </div>
    </SommelierShell>
  );
}
