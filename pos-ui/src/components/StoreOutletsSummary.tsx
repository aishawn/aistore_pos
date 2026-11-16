"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { parseTenantSlugFromHost } from "@/lib/tenant-host";

type OutletRow = { id: number; name: string };

export function StoreOutletsSummary({ className = "" }: { className?: string }) {
  const { user, ready } = useAuth();
  const [outlets, setOutlets] = useState<OutletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSlug(parseTenantSlugFromHost(window.location.host));
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const rows = await api.get<OutletRow[]>("/api/outlets");
        if (!cancelled) setOutlets(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setOutlets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ready, user?.outletId]);

  const count = outlets.length;
  const active = outlets.find((row) => row.id === user?.outletId);

  return (
    <section
      className={`rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 sm:p-5 ${className}`}
      aria-label="Store locations"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--oh-primary)]/10 text-[var(--oh-primary)]">
            <MapPin size={20} strokeWidth={1.8} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Your store</p>
            <p className="truncate text-base font-semibold text-[var(--oh-text)]">
              {slug ? `${slug}` : user?.subdomain ?? "Store"}
            </p>
            <p className="mt-0.5 text-sm text-[var(--oh-muted)]">
              {loading
                ? "Loading outlets…"
                : count === 0
                  ? "No outlets configured yet."
                  : `${count} outlet${count === 1 ? "" : "s"}${active ? ` · active: ${active.name}` : ""}`}
            </p>
          </div>
        </div>
        <Link
          href="/settings/registers-outlets"
          className="inline-flex min-h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-4 text-sm font-semibold text-[var(--oh-primary)] hover:bg-[var(--oh-surface)]"
        >
          Registers &amp; Outlets
        </Link>
      </div>
    </section>
  );
}