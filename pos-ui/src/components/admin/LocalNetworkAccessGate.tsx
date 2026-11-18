"use client";

import { useEffect, useState } from "react";
import { Info, RefreshCw } from "lucide-react";
import {
  probeLoopbackAccess,
  resolveLocalNetworkAccessState,
  watchLocalNetworkAccess,
  type LocalNetworkAccessState,
} from "@/lib/local-network-access";

export function LocalNetworkAccessGate({ children }: { children: React.ReactNode }) {
  const [accessState, setAccessState] = useState<LocalNetworkAccessState | "loading">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unwatch = () => undefined;
    void watchLocalNetworkAccess((state) => {
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
    try {
      await probeLoopbackAccess();
      const next = await resolveLocalNetworkAccessState();
      setAccessState(next);
    } finally {
      setBusy(false);
    }
  }

  if (accessState === "loading") {
    return <p className="text-sm text-[var(--oh-muted)]">Loading hardware settings…</p>;
  }

  return (
    <>
      {blocked && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/55 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="lna-gate-title"
            aria-describedby="lna-gate-desc"
            className="max-h-[min(90dvh,720px)] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-6 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sky-100 text-sky-800" aria-hidden="true">
                <Info size={20} />
              </span>
              <div>
                <h2 id="lna-gate-title" className="text-lg font-semibold text-[var(--oh-text)]">
                  Local network access required
                </h2>
                <p id="lna-gate-desc" className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">
                  Orithos needs permission to reach devices on this register (QZ Tray, Linkly adapters, and other local
                  hardware). Without it, printing and hardware connect will not work.
                </p>
              </div>
            </div>
            <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--oh-text)]">
              <li>Select the site controls icon to the left of the address bar.</li>
              <li>
                Turn on <span className="font-semibold">Local network access</span>
                {accessState === "denied" ? " (currently blocked for this site)" : ""}.
              </li>
              <li>Reload this page after saving the permission.</li>
            </ol>
            <p className="mt-4 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-xs leading-5 text-[var(--oh-muted)]">
              In Chrome or Edge, the toggle is usually labelled <span className="font-medium text-[var(--oh-text)]">Local network access</span> in site settings beside the address bar.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void requestAccess()}
                disabled={busy}
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Checking…" : "Request access"}
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)]"
              >
                <RefreshCw size={15} aria-hidden="true" />
                Reload page
              </button>
            </div>
          </section>
        </div>
      )}
      <div className={blocked ? "pointer-events-none select-none opacity-40" : undefined} aria-hidden={blocked || undefined}>
        {children}
      </div>
    </>
  );
}