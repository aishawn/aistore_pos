"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useSalesHistoryUiOptional } from "@/components/SalesHistoryUiProvider";
import { StockWorkspaceDialog } from "@/components/admin/StockWorkspaceDialog";
import { WorkspaceRecordsPanel } from "@/components/WorkspaceRecordsPanel";
import { getOdooPosBootstrap, type OdooPosBootstrap } from "@/lib/odoo-api";
import { formatOdooDateTime } from "@/lib/odoo-date";
import { useAuth } from "@/lib/auth";

type Config = OdooPosBootstrap["configs"][number];

export function SalesMenu({ config, onHelp }: { config?: Config | null; onHelp: () => void }) {
  const { hasPermission } = useAuth();
  const allowed = ["sell.checkout", "sell.refund", "reports.dashboard"].some(hasPermission);
  const { openSalesHistory } = useSalesHistoryUiOptional();
  const menu = useRef<HTMLDetailsElement>(null);
  const [view, setView] = useState<"payments" | "session" | null>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) menu.current?.removeAttribute("open"); };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) { menu.current.removeAttribute("open"); menu.current.querySelector("summary")?.focus(); }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, []);
  if (!allowed) return null;
  const items = [["history", "Sales history"], ["payments", "Payments"], ["refunds", "Refunds"], ["session", "Current session"], ["help", "Help"]] as const;
  return <>
    <details ref={menu} className="relative shrink-0">
      <summary aria-label="Sales menu" className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-full px-2 text-sm font-semibold text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)] [&::-webkit-details-marker]:hidden">Sales <ChevronDown size={14} /></summary>
      <div className="absolute right-0 z-50 mt-2 w-48 rounded-xl border border-[var(--oh-border)] bg-white p-1 shadow-lg">
        {items.map(([key, label]) => <button key={key} type="button" onClick={() => {
          menu.current?.removeAttribute("open"); menu.current?.querySelector("summary")?.focus();
          if (key === "history" || key === "refunds") openSalesHistory(key === "refunds" ? "refunded" : "all");
          else if (key === "help") onHelp();
          else setView(key);
        }} className="block min-h-11 w-full rounded-lg px-3 text-left text-sm hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">{label}</button>)}
      </div>
    </details>
    {view && <StockWorkspaceDialog title={view === "payments" ? "Payments" : "Current session"} variant={view === "payments" ? "records" : "default"} busy={false} onClose={() => { setView(null); menu.current?.querySelector("summary")?.focus(); }}>
      {view === "session" ? <CurrentSession config={config} /> : <WorkspaceRecordsPanel type={view} fillHeight />}
    </StockWorkspaceDialog>}
  </>;
}

function CurrentSession({ config }: { config?: Config | null }) {
  const [current, setCurrent] = useState<Config | null | undefined>(config);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function refresh() {
    setLoading(true); setError(null);
    try { const pos = await getOdooPosBootstrap(); setCurrent(pos.configs.find((item) => item.id === config?.id)); }
    catch { setError("Could not refresh this session. Please retry."); }
    finally { setLoading(false); }
  }
  const session = current?.session;
  return <div className="space-y-4 text-sm">
    <p className="text-[var(--oh-muted)]">Session for the register currently selected in Sell.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {session ? <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-4">
      <dt>Register</dt><dd>{current?.name}</dd><dt>Session</dt><dd>{session.name}</dd>
      <dt>Status</dt><dd>Open</dd><dt>Opened by</dt><dd>{session.user_id ? session.user_id[1] : "—"}</dd>
      <dt>Opened at</dt><dd>{session.start_at ? formatOdooDateTime(session.start_at, current?.timezone ?? "UTC", { dateStyle: "medium", timeStyle: "short" }) : "—"}</dd>
      <dt>Payment methods</dt><dd>{current?.paymentMethods.map((method) => method.name).join(", ") || "—"}</dd>
    </dl> : <p role="status">No open session for this register.</p>}
    <button type="button" onClick={() => void refresh()} disabled={loading} className="min-h-11 rounded-lg border px-3 disabled:opacity-50">{loading ? "Refreshing…" : "Refresh session"}</button>
  </div>;
}
