"use client";

import { useSyncExternalStore } from "react";
import {
  getHardwareReadinessItems,
  getHardwareReadinessSnapshot,
  subscribeLocalHardwareSettings,
  type HardwareReadinessItem,
} from "@/lib/local-hardware";

function toneClass(tone: HardwareReadinessItem["tone"]) {
  return tone === "ok"
    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
    : tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : "border-[var(--oh-border)] bg-white text-[var(--oh-muted)]";
}

export function HardwareReadinessStrip() {
  const snapshot = useSyncExternalStore(subscribeLocalHardwareSettings, getHardwareReadinessSnapshot, () => "");
  const items: HardwareReadinessItem[] = snapshot ? JSON.parse(snapshot) : getHardwareReadinessItems();

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Hardware readiness">
      {items.map((item) => (
        <li key={item.id} className={`rounded-lg border px-3 py-2 text-xs ${toneClass(item.tone)}`}>
          <span className="font-semibold">{item.label}</span>
          <span className="mt-0.5 block font-normal">{item.status}</span>
        </li>
      ))}
    </ul>
  );
}