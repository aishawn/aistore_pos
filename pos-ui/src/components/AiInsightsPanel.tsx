"use client";

import { MessageCircle } from "lucide-react";
import { useSellScreen } from "@/lib/sell-screen";

const INSIGHTS = [
  {
    id: "wet-gst",
    label: "WET TAX & GST CALCULATION",
    detail: "(Live)",
    bg: "var(--oh-tile-blue-bg)",
    border: "var(--oh-tile-blue-border)",
    color: "var(--oh-tile-blue-text)",
  },
  {
    id: "age-check",
    label: "AGE VERIFICATION CHECK REQUIRED",
    detail: "Liquor sale detected",
    bg: "var(--oh-tile-red-bg)",
    border: "var(--oh-tile-red-border)",
    color: "var(--oh-tile-red-text)",
  },
  {
    id: "licence",
    label: "LIQUOR LICENCE STATUS: ACTIVE",
    detail: "",
    bg: "var(--oh-tile-green-bg)",
    border: "var(--oh-tile-green-border)",
    color: "var(--oh-tile-green-text)",
  },
  {
    id: "inventory",
    label: "INVENTORY ALERT",
    detail: "Low stock on wine.",
    bg: "var(--oh-tile-red-bg)",
    border: "var(--oh-tile-red-border)",
    color: "var(--oh-tile-red-text)",
  },
  {
    id: "upsell",
    label: "PROMOTIONAL UP-SELL OP",
    detail: "Suggested craft beer…",
    bg: "var(--oh-tile-orange-bg)",
    border: "var(--oh-tile-orange-border)",
    color: "var(--oh-tile-orange-text)",
  },
  {
    id: "compliance",
    label: "COMPLIANCE CHECK",
    detail: "All clear",
    bg: "var(--oh-tile-green-bg)",
    border: "var(--oh-tile-green-border)",
    color: "var(--oh-tile-green-text)",
  },
];

/** Orithos AI Sales Insights — right panel matching reference mockup. */
export function AiInsightsPanel() {
  const sell = useSellScreen();

  return (
    <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-[var(--oh-radius)] bg-white shadow-[var(--oh-shadow-card)] lg:w-[290px] xl:w-[310px]">
      {/* Header */}
      <div className="border-b border-[var(--oh-border)] px-4 py-4">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-orange-light)]">
            <MessageCircle size={17} className="text-[var(--oh-orange)]" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--oh-text)]">Orithos AI</h2>
            <p className="text-[13px] leading-snug text-[var(--oh-muted)]">
              Live AI-generated business insights.
            </p>
          </div>
        </div>
      </div>

      {/* Status tiles — 2×3 grid with colored borders */}
      <div className="grid grid-cols-2 gap-2 p-3">
        {INSIGHTS.map((tile) => (
          <div
            key={tile.id}
            className="rounded-lg border p-2.5"
            style={{
              backgroundColor: tile.bg,
              borderColor: tile.border,
              color: tile.color,
            }}
          >
            <p className="text-[9px] font-bold uppercase leading-tight tracking-wide">{tile.label}</p>
            {tile.detail && <p className="mt-0.5 text-[9px] leading-tight opacity-85">{tile.detail}</p>}
          </div>
        ))}
      </div>

      {/* Customer profile */}
      <div className="mx-3 mb-3 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3">
        <p className="mb-2 text-[13px] font-bold uppercase tracking-wider text-[var(--oh-muted)]">
          Customer Profile
        </p>
        {sell.customer ? (
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--oh-navy)] text-[13px] font-bold text-white">
              {sell.customer.name.charAt(0)}
            </span>
            <div>
              <p className="text-[13px] font-medium text-[var(--oh-text)]">{sell.customer.name}</p>
              <p className="text-[13px] text-[var(--oh-muted)]">Australian Loyalty ID</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--oh-border)] text-[var(--oh-muted)]">
              👤
            </span>
            <p className="text-[13px] text-[var(--oh-muted)]">Australian Loyalty ID</p>
          </div>
        )}
      </div>

      {/* AI input + orange Action button */}
      <div className="mt-auto border-t border-[var(--oh-border)] p-3">
        <textarea
          rows={2}
          placeholder="Type a response message…"
          className="mb-2 w-full resize-none rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-[13px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)]"
        />
        <button
          type="button"
          className="w-full cursor-pointer rounded-[var(--oh-radius)] bg-[var(--oh-primary)] py-2.5 text-[14px] font-bold text-white transition-colors hover:bg-[var(--oh-primary-hover)]"
        >
          Action
        </button>
      </div>
    </aside>
  );
}
