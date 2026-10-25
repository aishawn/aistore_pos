"use client";
import { useEffect, useState } from "react";

export function OdooRecordLink({ model, id, children }: { model: string; id?: number; children: React.ReactNode }) {
  const [base, setBase] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/odoo/customer-tools", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Orithos link unavailable");
      const data = await response.json();
      if (!cancelled && typeof data.baseUrl === "string") setBase(data.baseUrl);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [retry]);
  if (!base) return failed
    ? <button type="button" onClick={() => { setFailed(false); setRetry((value) => value + 1); }} className="min-h-11 text-sm text-[var(--oh-primary)] underline">Retry Orithos link</button>
    : <span role="status" className="text-sm text-[var(--oh-muted)]">Loading Orithos link…</span>;
  return <a href={`${base}/web#model=${encodeURIComponent(model)}${id ? `&id=${id}&view_type=form` : "&view_type=list"}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-primary)]">{children} ↗</a>;
}
