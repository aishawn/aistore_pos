"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { StoreSettingsPage as AdminPageLayout } from "@/components/admin/StoreSettingsPage";
import { AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type CatalogColumn = { key: string; label: string; type?: "text" | "number" | "boolean" };

type Row = Record<string, unknown> & { id?: number };

export function SettingsCatalogCrud({
  title,
  subtitle,
  endpoint,
  columns,
  createDefaults,
  toolbar,
}: {
  title: string;
  subtitle: string;
  endpoint: string;
  columns: CatalogColumn[];
  createDefaults?: Record<string, unknown>;
  toolbar?: React.ReactNode;
}) {
  const { ready, hasPermission } = useAuth();
  const canEdit = ready && hasPermission("settings.store");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Row[]>(endpoint);
      setRows(Array.isArray(data) ? data : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not load ${title}.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [endpoint]);

  const empty = useMemo(() => {
    const next: Row = { ...(createDefaults ?? {}) };
    for (const column of columns) {
      if (next[column.key] === undefined) {
        next[column.key] = column.type === "boolean" ? false : column.type === "number" ? 0 : "";
      }
    }
    return next;
  }, [columns, createDefaults]);

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = String(row.name ?? "").trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].filter(([, count]) => count > 1).map(([name, count]) => ({ name, count }));
  }, [rows]);

  async function dedupeCatalogues() {
    if (!canEdit) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/settings/import/dedupe", {});
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dedupe failed.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      if (draft.id) {
        await api.put(`${endpoint}/${draft.id}`, draft);
      } else {
        await api.post(endpoint, draft);
      }
      setDraft(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!canEdit || !window.confirm("Delete this record?")) return;
    setBusy(true);
    try {
      await api.del(`${endpoint}/${id}`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPageLayout
      title={title}
      subtitle={subtitle}
      count={loading || error ? undefined : rows.length}
      countLabel="Items"
      actions={
        <div className="flex flex-wrap gap-2">
          <AdminSecondaryButton onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} className={loading ? "animate-spin" : undefined} /> Refresh
          </AdminSecondaryButton>
          {canEdit && (
            <AdminSecondaryButton onClick={() => setDraft({ ...empty })}>
              <Plus size={15} /> Add
            </AdminSecondaryButton>
          )}
        </div>
      }
      toolbar={toolbar}
    >
      <section className="mb-4 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-3 text-sm text-[var(--oh-text-secondary)]">
        Managed in Orithos. Source-backed fields may be refreshed during Shopfront settings sync.
      </section>
      {duplicateNames.length > 0 && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <span>
            Duplicate names detected ({duplicateNames.map((row) => `${row.name}×${row.count}`).join(", ")}). Keep the oldest row and merge the rest.
          </span>
          {canEdit && (
            <button type="button" disabled={busy} onClick={() => void dedupeCatalogues()} className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              Deduplicate now
            </button>
          )}
        </div>
      )}
      {error && <div role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{error}</div>}
      {draft && (
        <div className="mb-4 grid gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 sm:grid-cols-2">
          {columns.map((column) => (
            <label key={column.key} className="grid gap-1 text-sm font-medium">
              {column.label}
              {column.type === "boolean" ? (
                <input
                  type="checkbox"
                  checked={Boolean(draft[column.key])}
                  disabled={!canEdit || busy}
                  onChange={(e) => setDraft({ ...draft, [column.key]: e.target.checked })}
                />
              ) : (
                <input
                  className="h-10 rounded-lg border border-[var(--oh-border)] px-3"
                  type={column.type === "number" ? "number" : "text"}
                  value={String(draft[column.key] ?? "")}
                  disabled={!canEdit || busy}
                  onChange={(e) => setDraft({
                    ...draft,
                    [column.key]: column.type === "number" ? Number(e.target.value) : e.target.value,
                  })}
                />
              )}
            </label>
          ))}
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" disabled={!canEdit || busy} onClick={() => void save()} className="rounded-lg bg-[var(--oh-primary)] px-4 py-2 text-sm font-semibold text-white">Save</button>
            <button type="button" disabled={busy} onClick={() => setDraft(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}
      {loading ? (
        <div className="rounded-lg border border-[var(--oh-border)] bg-white p-8 text-sm text-[var(--oh-muted)]">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-[var(--oh-border)] bg-white px-4 py-12 text-center text-sm text-[var(--oh-muted)]">
          No records yet. Import from Shopfront or add one here.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
              <tr>
                {columns.map((column) => <th key={column.key} className="px-4 py-3">{column.label}</th>)}
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--oh-border)]">
              {rows.map((row) => (
                <tr key={String(row.id)}>
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-3">{String(row[column.key] ?? "")}</td>
                  ))}
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {canEdit && <button type="button" className="text-[var(--oh-primary)] underline" onClick={() => setDraft({ ...row })}>Edit</button>}
                      {canEdit && row.id != null && (
                        <button type="button" className="inline-flex items-center gap-1 text-red-700" onClick={() => void remove(Number(row.id))}>
                          <Trash2 size={14} /> Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPageLayout>
  );
}
