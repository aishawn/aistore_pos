"use client";

import { useSyncExternalStore } from "react";
import {
  getLocalHardwareSettings,
  getLocalHardwareSettingsSnapshot,
  hasBarcodeScannerTested,
  isLocalPrinterBridgeActive,
  subscribeLocalHardwareSettings,
} from "@/lib/local-hardware";
import { getEftposReadinessSnapshotJson, readEftposReadinessSnapshot } from "@/lib/hardware-eftpos-readiness";

type StepId = "install" | "network" | "connect" | "printer" | "test" | "eftpos";

const STEP_META: { id: StepId; label: string }[] = [
  { id: "install", label: "Install agent" },
  { id: "network", label: "Allow local network" },
  { id: "connect", label: "Connect bridge" },
  { id: "printer", label: "Save printer" },
  { id: "test", label: "Test print & drawer" },
  { id: "eftpos", label: "Enable EFTPOS" },
];

function stepState(id: StepId): "done" | "current" | "upcoming" {
  const settings = getLocalHardwareSettings();
  const bridge = isLocalPrinterBridgeActive();
  const eftpos = readEftposReadinessSnapshot();
  const scannerOk = hasBarcodeScannerTested();

  const done: Record<StepId, boolean> = {
    install: bridge,
    network: bridge,
    connect: bridge,
    printer: Boolean(settings.printer.trim()),
    test: scannerOk || bridge,
    eftpos: eftpos.paymentsEnabled && eftpos.connectorHealth === "reachable",
  };

  const order = STEP_META.map((s) => s.id);
  const firstIncomplete = order.find((key) => !done[key]) ?? "eftpos";
  if (done[id]) return "done";
  if (id === firstIncomplete) return "current";
  return "upcoming";
}

export function HardwareSetupSteps() {
  const settingsSnap = useSyncExternalStore(subscribeLocalHardwareSettings, getLocalHardwareSettingsSnapshot, () => "");
  const eftposSnap = useSyncExternalStore(
    subscribeLocalHardwareSettings,
    getEftposReadinessSnapshotJson,
    () => "",
  );
  void settingsSnap;
  void eftposSnap;

  return (
    <nav aria-label="Hardware setup steps" className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--oh-muted)]">Setup checklist</p>
      <ol className="mt-2 flex flex-wrap gap-2">
        {STEP_META.map((step) => {
          const state = stepState(step.id);
          const className =
            state === "done"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : state === "current"
                ? "border-[var(--oh-primary)] bg-white text-[var(--oh-text)] ring-1 ring-[var(--oh-primary)]"
                : "border-[var(--oh-border)] bg-white text-[var(--oh-muted)]";
          return (
            <li
              key={step.id}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
              aria-current={state === "current" ? "step" : undefined}
            >
              {step.label}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}