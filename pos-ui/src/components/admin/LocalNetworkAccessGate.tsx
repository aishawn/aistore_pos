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

export function LocalNetworkAccessGate({ children }: { children: React.ReactNode }) {
  const [accessState, setAccessState] = useState<LocalNetworkAccessState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const browserHint = typeof window !== "undefined" ? localNetworkAccessBrowserHint() : null;
  const siteHost = typeof window !== "undefined" ? window.location.hostname : "this site";

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
        setHint("Open site controls → Site settings → Local network access → Allow, then reload.");
        return;
      }
      await probeLoopbackAccess();
      const next = await resolveHardwareNetworkAccessState();
      setAccessState(next);
      if (next === "granted") {
        setHint("Access granted. You can configure printers and EFTPOS below.");
      } else if (next === "prompt") {
        setHint(
          "Look for an Allow / Block bar at the top of the browser. If none appears, open Site settings from the address bar menu and set Local network access to Allow, then reload.",
        );
      } else if (next === "denied") {
        setHint("Access was denied. Turn on Local network access in site settings and reload.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (accessState === "loading") {
    return <p className="text-sm text-[var(--oh-muted)]">Loading hardware settings…</p>;
  }

  const dialog = blocked ? (
    <div className="fixed inset-0 z-[9998] grid place-items-center bg-slate-950/55 p-4" role="presentation">
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
              Orithos needs permission to reach apps on this register (Orithos Hardware Connect, QZ Tray, Linkly
              connector, and other loopback services). Without it, printing and EFTPOS setup will not work.
            </p>
          </div>
        </div>
        <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--oh-text)]">
          <li>Click the site controls icon to the left of the address bar.</li>
          <li>
            Open <span className="font-semibold">Site settings</span> — the toggle is usually{" "}
            <em>not</em> shown in the short menu.
          </li>
          <li>
            Set <span className="font-semibold">Local network access</span> to <span className="font-semibold">Allow</span>
            {accessState === "denied" ? " (currently blocked for this site)" : ""}.
          </li>
          <li>Return here and use <span className="font-semibold">Reload page</span>.</li>
        </ol>
        <p className="mt-4 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-xs leading-5 text-[var(--oh-muted)]">
          Requires <span className="font-medium text-[var(--oh-text)]">Chrome 142+</span> or{" "}
          <span className="font-medium text-[var(--oh-text)]">Edge 143+</span>. You can also allow{" "}
          <span className="font-medium text-[var(--oh-text)]">{siteHost}</span> under Chrome → Settings → Privacy and
          security → Site settings → Local network access.
        </p>
        {browserHint ? (
          <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950">
            {browserHint}
          </p>
        ) : null}
        {hint ? (
          <p role="status" className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm leading-6 text-sky-950">
            {hint}
          </p>
        ) : null}
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
  ) : null;

  const readyForHardware = accessState === "granted" || accessState === "unsupported";

  return (
    <>
      {portalReady && dialog ? createPortal(dialog, document.body) : dialog}
      {readyForHardware ? <div>{children}</div> : null}
    </>
  );
}
