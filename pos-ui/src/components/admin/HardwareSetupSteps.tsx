"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import {
  getLocalHardwareSettings,
  getLocalHardwareSettingsSnapshot,
  hasBarcodeScannerTested,
  isLocalPrinterBridgeActive,
  subscribeLocalHardwareSettings,
} from "@/lib/local-hardware";
import { getEftposReadinessSnapshotJson, readEftposReadinessSnapshot } from "@/lib/hardware-eftpos-readiness";
import {
  resolveHardwareNetworkAccessState,
  watchHardwareNetworkAccess,
  type LocalNetworkAccessState,
} from "@/lib/local-network-access";

type StepId = "install" | "network" | "connect" | "printer" | "test" | "eftpos";

const STEP_META: { id: StepId; label: string; anchor: string }[] = [
  { id: "install", label: "Install agent", anchor: "hardware-connect" },
  { id: "network", label: "Browser access", anchor: "hardware-connect" },
  { id: "connect", label: "Connect on this PC", anchor: "hardware-connect" },
  { id: "printer", label: "Save printer", anchor: "hardware-printer" },
  { id: "test", label: "Test devices", anchor: "hardware-scanner" },
  { id: "eftpos", label: "Card payments", anchor: "hardware-eftpos" },
];

function stepDone(id: StepId, bridge: boolean, network: LocalNetworkAccessState): boolean {
  const settings = getLocalHardwareSettings();
  const eftpos = readEftposReadinessSnapshot();

  switch (id) {
    case "install":
      return bridge;
    case "network":
      return network === "granted" || network === "unsupported";
    case "connect":
      return bridge;
    case "printer":
      return Boolean(settings.printer.trim()) && bridge;
    case "test":
      return hasBarcodeScannerTested();
    case "eftpos":
      return eftpos.paymentsEnabled && eftpos.connectorHealth === "reachable";
    default:
      return false;
  }
}

function stepState(
  id: StepId,
  bridge: boolean,
  network: LocalNetworkAccessState,
): "done" | "current" | "upcoming" {
  const order = STEP_META.map((s) => s.id);
  const done = Object.fromEntries(
    order.map((key) => [key, stepDone(key, bridge, network)]),
  ) as Record<StepId, boolean>;
  const firstIncomplete = order.find((key) => !done[key]) ?? "eftpos";
  if (done[id]) return "done";
  if (id === firstIncomplete) return "current";
  return "upcoming";
}

function stepHint(id: StepId, bridge: boolean, network: LocalNetworkAccessState): string {
  const settings = getLocalHardwareSettings();
  const eftpos = readEftposReadinessSnapshot();
  if (stepDone(id, bridge, network)) {
    switch (id) {
      case "printer":
        return settings.printer ? settings.printer : "Ready";
      case "eftpos":
        return "Ready on Sell";
      default:
        return "Done";
    }
  }
  switch (id) {
    case "install":
      return "Download Hardware Connect";
    case "network":
      return network === "denied" ? "Allow in site settings" : "Allow local network";
    case "connect":
      return "Connect on this PC";
    case "printer":
      return settings.printer.trim() && !bridge ? "Saved — connect first" : "Choose receipt printer";
    case "test":
      return hasBarcodeScannerTested() ? "Scanner verified on this PC" : "Scan a barcode below";
    case "eftpos":
      return eftpos.paymentsEnabled ? "Start EFTPOS bridge" : "Optional · Linkly";
    default:
      return "";
  }
}

function focusSetupAnchor(anchorId: string) {
  const el = document.getElementById(anchorId);
  if (!el) return;
  if (el instanceof HTMLDetailsElement) {
    el.open = true;
  } else if (el.tagName === "DETAILS") {
    (el as HTMLDetailsElement).open = true;
  }
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  window.dispatchEvent(new CustomEvent("hardware-setup-focus", { detail: { anchor: anchorId } }));
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

  const bridge = isLocalPrinterBridgeActive();
  const [network, setNetwork] = useState<LocalNetworkAccessState>("unsupported");

  useEffect(() => {
    let cancelled = false;
    let unwatch: () => void = () => undefined;
    void resolveHardwareNetworkAccessState().then((state) => {
      if (!cancelled) setNetwork(state);
    });
    void watchHardwareNetworkAccess((state) => {
      if (!cancelled) setNetwork(state);
    }).then((cleanup) => {
      unwatch = cleanup;
    });
    return () => {
      cancelled = true;
      unwatch();
    };
  }, []);

  const completed = STEP_META.filter((step) => stepDone(step.id, bridge, network)).length;

  return (
    <nav
      aria-label="Device setup steps"
      className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-3 sm:px-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--oh-muted)]">Setup progress</p>
        <p className="text-xs tabular-nums text-[var(--oh-muted)]">
          <span className="font-semibold text-[var(--oh-text)]">{completed}</span> of {STEP_META.length} complete
        </p>
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {STEP_META.map((step, index) => {
          const state = stepState(step.id, bridge, network);
          const hint = stepHint(step.id, bridge, network);
          const ring =
            state === "done"
              ? "border-emerald-200 bg-emerald-50/80"
              : state === "current"
                ? "border-[var(--oh-primary)] bg-white ring-1 ring-[var(--oh-primary)]"
                : "border-[var(--oh-border)] bg-white";
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => focusSetupAnchor(step.anchor)}
                aria-current={state === "current" ? "step" : undefined}
                className={`flex w-full min-h-11 items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-[var(--oh-surface)] ${ring}`}
              >
                <span
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold ${
                    state === "done"
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : state === "current"
                        ? "border-[var(--oh-primary)] text-[var(--oh-primary)]"
                        : "border-[var(--oh-border)] text-[var(--oh-muted)]"
                  }`}
                  aria-hidden="true"
                >
                  {state === "done" ? <Check size={12} strokeWidth={3} /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-[var(--oh-text)]">{step.label}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-normal text-[var(--oh-muted)]">{hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}