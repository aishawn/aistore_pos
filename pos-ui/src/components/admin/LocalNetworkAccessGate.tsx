"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Info, RefreshCw } from "lucide-react";
import {
  localNetworkAccessBrowserHint,
  probeLoopbackAccess,
  resolveHardwareNetworkAccessState,
  watchHardwareNetworkAccess,
  type LocalNetworkAccessState,
} from "@/lib/local-network-access";
import { HardwareConnectInstallCard } from "@/components/admin/HardwareConnectInstallCard";
import { HardwareLoopbackProvider } from "@/components/admin/hardware-loopback-context";

export function LocalNetworkAccessGate({ children }: { children: React.ReactNode }) {
  const [accessState, setAccessState] = useState<LocalNetworkAccessState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const browserHint = typeof window !== "undefined" ? localNetworkAccessBrowserHint() : null;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unwatch: () => void = () => undefined;
    void watchHardwareNetworkAccess((state) => {
      if (!cancelled) setAccessState(state);
    }).then((cleanup) => {
      unwatch = cleanup;
    });
    return () => {
      cancelled = true;
      unwatch();
    };
  }, []);

  const blocked = accessState === "prompt" || accessState === "denied";

  async function requestAccess() {
    setBusy(true);
    setHint(null);
    try {
      if (accessState === "denied") {
        setHint("Site settings → Local network access → Allow, then reload.");
        return;
      }
      await probeLoopbackAccess();
      const next = await resolveHardwareNetworkAccessState();
      setAccessState(next);
      if (next === "granted") {
        setHint("Access granted. Configure hardware below.");
      } else if (next === "prompt") {
        setHint("Use the browser prompt, or set Local network access to Allow in site settings.");
      } else if (next === "denied") {
        setHint("Turn on Local network access in site settings, then reload.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (accessState === "loading") {
    return <p className="text-sm text-[var(--oh-muted)]">Loading hardware settings…</p>;
  }

  const dialog = blocked ? (
    <div className="fixed inset-0 z-[9998] grid place-items-center bg-slate-950/55 p-4 sm:p-6" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="lna-gate-title"
        aria-describedby="lna-gate-desc"
        className="flex max-h-[min(90dvh,560px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] shadow-2xl"
      >
        <header className="shrink-0 border-b border-[var(--oh-border)] px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-full bg-sky-100 text-sky-800"
              aria-hidden="true"
            >
              <Info size={18} />
            </span>
            <div className="min-w-0">
              <h2 id="lna-gate-title" className="text-base font-semibold text-[var(--oh-text)] sm:text-lg">
                Local network access required
              </h2>
              <p id="lna-gate-desc" className="mt-1 text-sm text-[var(--oh-muted)]">
                Complete both steps on this PC: install the register agent, then allow the browser to reach local
                hardware.
                {accessState === "denied" ? " Browser access is currently blocked." : null}
              </p>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            <div className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4">
              <p className="text-sm font-semibold text-[var(--oh-text)]">
                <span className="text-[var(--oh-muted)]">Step 2 ·</span> Browser
              </p>
              <ul className="mt-2 space-y-1.5 text-sm leading-snug text-[var(--oh-text)]">
                <li>
                  <span className="text-[var(--oh-muted)]">1.</span> Address bar →{" "}
                  <span className="font-medium">Site settings</span>
                </li>
                <li>
                  <span className="text-[var(--oh-muted)]">2.</span>{" "}
                  <span className="font-medium">Local network access</span> → Allow
                </li>
                <li>
                  <span className="text-[var(--oh-muted)]">3.</span> Reload this page
                </li>
              </ul>
              <p className="mt-3 text-xs leading-5 text-[var(--oh-muted)]">Chrome 142+ or Edge 143+.</p>
            </div>
            <div className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4">
              <p className="text-sm font-semibold text-[var(--oh-text)]">
                <span className="text-[var(--oh-muted)]">Step 1 ·</span> Register agent
              </p>
              <div className="mt-2">
                <HardwareConnectInstallCard compact />
              </div>
            </div>
          </div>

          {browserHint ? (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
            >
              {browserHint}
            </p>
          ) : null}
          {hint ? (
            <p role="status" className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
              {hint}
            </p>
          ) : null}
        </div>

        <footer className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--oh-border)] px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => void requestAccess()}
            disabled={busy}
            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50 sm:flex-none"
          >
            {busy ? "Checking…" : "Request access"}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] sm:flex-none"
          >
            <RefreshCw size={15} aria-hidden="true" />
            Reload page
          </button>
        </footer>
      </section>
    </div>
  ) : null;

  const readyForHardware = accessState === "granted" || accessState === "unsupported";

  return (
    <HardwareLoopbackProvider loopbackReady={readyForHardware}>
      {portalReady && dialog ? createPortal(dialog, document.body) : dialog}
      {readyForHardware ? <div>{children}</div> : null}
    </HardwareLoopbackProvider>
  );
}