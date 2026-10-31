"use client";

import { useCallback, useEffect, useState } from "react";

type Job = { id: number; state: string; snapshotAt: string | null; backup: { sha256?: string; catalogueVerified?: boolean }; copiedTables: number; linkedTables: number; manifest: { counts?: Record<string, number>; limitations?: string[] }; error?: string };
const button = "min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-4 text-sm font-medium disabled:opacity-50";

export default function DemoResetPage() {
  const [job, setJob] = useState<Job | null>(null);
  const [preview, setPreview] = useState<{ counts: Record<string, number>; limitations: string[] } | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/platform/demo-reset", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    setJob(data.job);
  }, []);
  useEffect(() => { void refresh().catch((e) => setError(e.message)); }, [refresh]);
  const running = !!job && !["active", "ready", "failed"].includes(job.state);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => { void refresh().catch((e) => setError(e.message)); }, 10_000);
    return () => clearInterval(timer);
  }, [running, refresh]);
  async function act(action: string) {
    setBusy(true); setError("");
    const key = requestKey || crypto.randomUUID();
    if (action === "start") setRequestKey(key);
    try {
      const response = await fetch("/api/platform/demo-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, requestKey: key, confirm: confirmation, jobId: job?.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      if (data.preview) setPreview(data.preview);
      if (data.job) { setJob(data.job); if (data.job.state === "active") { setRequestKey(""); setConfirmation(""); setPreview(null); } }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update demo."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
    <header><h1 className="text-2xl font-semibold">Demo sandbox</h1><p className="mt-2 text-sm text-[var(--oh-text-secondary)]">Replace demo with an independent snapshot of SKR. Your demo login stays the same. SKR stays read-only.</p></header>
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">A reset replaces demo edits and test transactions. Refreshes are manual. The previous demo generation is retained for recovery. Real payment terminals and outgoing email are disabled in the replica.</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-3"><button className={button} disabled={busy || running} onClick={() => void act("preview")}>Preview SKR snapshot</button><button className={button} disabled={busy} onClick={() => void refresh().catch((e) => setError(e.message))}>Refresh status</button></div>
    {preview && <section className="rounded-lg border p-4"><h2 className="font-semibold">Source data available</h2><dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{Object.entries(preview.counts).map(([name, count]) => <div key={name}><dt className="text-sm">{name.replaceAll("_", " ")}</dt><dd className="text-lg font-semibold">{count.toLocaleString()}</dd></div>)}</dl><ul className="mt-4 list-disc space-y-1 pl-5 text-sm">{preview.limitations.map((text) => <li key={text}>{text}</li>)}</ul><label className="mt-4 block text-sm" htmlFor="reset-confirm">Type REPLACE DEMO to replace the demo data</label><input id="reset-confirm" className="mt-2 min-h-11 w-full rounded border px-3" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" /><button className={`${button} mt-3`} disabled={busy || running || job?.state === "ready" || confirmation !== "REPLACE DEMO"} onClick={() => void act("start")}>Back up and prepare replica</button></section>}
    {job && <section aria-live="polite" className="rounded-lg border p-4"><h2 className="font-semibold">Reset #{job.id}: {job.state}</h2><p className="mt-2 text-sm">Snapshot: {job.snapshotAt || "Not frozen yet"}</p><p className="mt-2 text-sm">Backup: {job.backup.catalogueVerified ? "Verified" : "Pending"} · Tables copied: {job.copiedTables} · Links verified: {job.linkedTables}</p>{job.backup.sha256 && <p className="mt-2 break-all text-xs">Backup SHA256: {job.backup.sha256}</p>}{job.error && <p role="alert" className="mt-3 text-sm text-red-800">Reset stopped. Demo has not been switched. {job.error}</p>}{job.state === "ready" && <button className={`${button} mt-4`} disabled={busy} onClick={() => void act("activate")}>Switch demo to verified replica</button>}{job.state === "active" && <p className="mt-4 text-sm">Demo uses the independent SKR snapshot. Sign in to demo again before testing. Your changes will remain until the next manual reset.</p>}</section>}
  </main>;
}
