"use client";

import { useCallback, useEffect, useState } from "react";

type StatusPayload = {
  business_day?: string;
  parity?: {
    shopfront_revenue_match?: boolean;
    demo_shopfront_revenue?: number;
    skr_shopfront_revenue?: number;
    demo_other_sales?: number;
  };
  product_mappings?: { demo_mapped?: number; skr_mapped?: number };
  demo?: { other_transactions?: number; shopfront_revenue?: number };
  crawler_configured?: boolean;
};

const button =
  "min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-4 text-sm font-medium disabled:opacity-50";

async function readApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.data?.message || "Request failed");
  }
  if (payload.code !== undefined && payload.code !== 0) {
    throw new Error(payload.message || "Request failed");
  }
  return (payload.data ?? payload) as T;
}

export default function DemoResetPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [preview, setPreview] = useState<{ limitations: string[] } | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastRun, setLastRun] = useState<Record<string, unknown> | null>(null);

  const refresh = useCallback(async () => {
    const data = await readApi<StatusPayload>("/api/platform/demo-sandbox/status");
    setStatus(data);
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : "Could not load status"));
  }, [refresh]);

  async function act(action: "preview" | "purge" | "queue" | "clone" | "rebaseline") {
    setBusy(true);
    setError("");
    try {
      if (action === "preview") {
        const data = await readApi<{ limitations: string[] }>("/api/platform/demo-sandbox/preview");
        setPreview(data);
        return;
      }
      if (action === "purge") {
        const data = await readApi<Record<string, unknown>>("/api/platform/demo-sandbox/purge", { method: "POST" });
        setLastRun({ action, result: data });
        await refresh();
        return;
      }
      if (action === "queue") {
        const data = await readApi<Record<string, unknown>>("/api/platform/demo-sandbox/queue-sync", { method: "POST" });
        setLastRun({ action, result: data });
        return;
      }
      if (action === "clone") {
        const data = await readApi<Record<string, unknown>>("/api/platform/demo-sandbox/clone-mappings?limit=1500", {
          method: "POST",
        });
        setLastRun({ action, result: data });
        await refresh();
        return;
      }
      const data = await readApi<Record<string, unknown>>("/api/platform/demo-sandbox/rebaseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm, limit: 1500 }),
      });
      setLastRun({ action, result: data });
      setConfirm("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const parity = status?.parity;
  const match = parity?.shopfront_revenue_match === true;
  const otherSales = parity?.demo_other_sales ?? status?.demo?.other_transactions ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold">Demo sandbox</h1>
        <p className="mt-2 text-sm text-[var(--oh-text-secondary)]">
          Test on demo.orithos.com.au, then rebaseline from Shopfront sync and SKR mappings. SKR stays read-only.
        </p>
      </header>

      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
        Rebaseline removes non-Shopfront Demo sales, queues crawler sync for <code>store_key=demo</code>, clones product
        mappings from SKR, and verifies yesterday&apos;s Shopfront revenue parity.
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}

      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">Drift snapshot</h2>
        <p className="mt-2 text-sm text-[var(--oh-text-secondary)]">
          Business day {status?.business_day ?? "—"}
          {status?.crawler_configured === false ? " · Crawler URL not configured on API" : ""}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-sm">Yesterday Shopfront parity</dt>
            <dd className={`text-lg font-semibold ${match ? "text-emerald-700" : "text-amber-700"}`}>
              {match ? "Matched" : "Check"}
            </dd>
          </div>
          <div>
            <dt className="text-sm">Demo other sales (all time)</dt>
            <dd className="text-lg font-semibold">{Number(otherSales).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-sm">Product mappings</dt>
            <dd className="text-lg font-semibold">
              Demo {status?.product_mappings?.demo_mapped?.toLocaleString() ?? "—"} / SKR{" "}
              {status?.product_mappings?.skr_mapped?.toLocaleString() ?? "—"}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className={button} disabled={busy} onClick={() => void refresh().catch((e) => setError(e.message))}>
            Refresh
          </button>
          <button type="button" className={button} disabled={busy} onClick={() => void act("preview")}>
            Preview plan
          </button>
          <button type="button" className={button} disabled={busy} onClick={() => void act("purge")}>
            Purge local sales only
          </button>
          <button type="button" className={button} disabled={busy} onClick={() => void act("queue")}>
            Queue demo sync
          </button>
          <button type="button" className={button} disabled={busy} onClick={() => void act("clone")}>
            Repair mappings
          </button>
        </div>
      </section>

      {preview && (
        <section className="rounded-lg border p-4">
          <h2 className="font-semibold">Rebaseline scope</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {preview.limitations.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">Full rebaseline</h2>
        <p className="mt-2 text-sm text-[var(--oh-text-secondary)]">
          Runs purge → queue sync → mapping repair → verify. Type <strong>RESET DEMO</strong> to confirm.
        </p>
        <label className="mt-4 block text-sm" htmlFor="reset-confirm">
          Confirmation
        </label>
        <input
          id="reset-confirm"
          className="mt-2 min-h-11 w-full rounded border px-3"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
        />
        <button
          type="button"
          className={`${button} mt-3`}
          disabled={busy || confirm !== "RESET DEMO"}
          onClick={() => void act("rebaseline")}
        >
          Rebaseline demo now
        </button>
      </section>

      {lastRun && (
        <section className="rounded-lg border p-4 text-sm">
          <h2 className="font-semibold">Last action: {String(lastRun.action)}</h2>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-[var(--oh-bg-muted)] p-3 text-xs">
            {JSON.stringify(lastRun.result, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}