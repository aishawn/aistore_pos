"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getRetailPosBootstrap, getRetailSessionStatus } from "@/lib/retail-api";
import { useAuth } from "@/lib/auth";

export function StoreConnectionStatus() {
 const { user } = useAuth();
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [registers, setRegisters] = useState<number | null>(null);
 const refresh = useCallback(async () => {
  setLoading(true); setError(null); setRegisters(null);
  try {
   const session = await getRetailSessionStatus();
   if (!session.user) throw new Error("The store connection is unavailable. Contact your administrator to restore it.");
   const result = await getRetailPosBootstrap();
   setRegisters(result.configs.length);
  } catch { setError("Could not confirm the store connection. Retry or contact your administrator."); }
  finally { setLoading(false); }
 }, []);
 useEffect(() => { void refresh(); }, [refresh]);
 return <section className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-[var(--oh-text)]">Connection status</h2><button type="button" onClick={() => void refresh()} disabled={loading} className="min-h-11 rounded-lg border border-[var(--oh-border)] px-4 text-sm font-medium disabled:opacity-50">{loading ? "Checking…" : "Check again"}</button></div><div className="mt-4 rounded-lg border border-[var(--oh-border)] p-4"><h3 className="text-sm font-semibold">Business data service</h3>{loading ? <p role="status" className="mt-2 text-sm text-[var(--oh-muted)]">Checking live store access…</p> : error ? <p role="alert" className="mt-2 text-sm text-[var(--brand-danger)]">{error}</p> : <p role="status" className="mt-2 text-sm text-[var(--oh-muted)]">Connected · {registers} accessible POS registers.</p>}</div><div className="mt-4 rounded-lg border border-[var(--oh-border)] p-4"><h3 className="text-sm font-semibold">AI services</h3><p className="mt-2 text-sm text-[var(--oh-muted)]">Provider connectivity has not been checked here. Open the AI workspace to see available tools and their service status.</p><Link href="/ai" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-[var(--oh-primary)]">Open AI workspace</Link></div>{!user?.isAdmin && <p className="mt-4 text-sm text-[var(--oh-muted)]">Connection configuration is managed by your store administrator.</p>}</section>;
}
