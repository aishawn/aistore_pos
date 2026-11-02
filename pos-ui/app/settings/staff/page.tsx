"use client";

import { useMemo, useState } from "react";
import { ShieldCheck, UserPlus, X } from "lucide-react";
import { UserSettingsScaffold } from "@/components/admin/UserSettingsScaffold";
import { AsyncState } from "@/components/admin/AsyncState";
import { api, apiFailureMessage } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/lib/auth";

type StaffUser = { id: number; name?: string; username: string; email?: string; isAdmin?: boolean; roleId?: number | null; pendingPasswordReset?: boolean; deletedAt?: string | null };
type Role = { id: number; name: string; managedId?: string | null };
type Permission = { id: number; name: string; safeName: string; section?: string };

type Panel = "create" | "edit" | null;

const sectionOrder = ["Sell", "Stock", "Customers", "Reports", "AI", "Settings"];

export default function StaffSettingsPage() {
  const { user, ready } = useAuth();
  const users = useApi<StaffUser[]>("/api/users");
  const roles = useApi<Role[]>("/api/roles");
  const permissions = useApi<Permission[]>("/api/permissions");
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [selected, setSelected] = useState<StaffUser | null>(null);
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => (users.data ?? []).filter((row) => {
    const text = `${row.name ?? ""} ${row.username} ${row.email ?? ""}`.toLowerCase();
    return text.includes(query.toLowerCase());
  }), [users.data, query]);

  const selectedRole = roles.data?.find((role) => String(role.id) === roleId);
  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const permission of permissions.data ?? []) {
      const key = permission.section || "Other";
      map.set(key, [...(map.get(key) ?? []), permission]);
    }
    return sectionOrder.filter((key) => map.has(key)).map((key) => [key, map.get(key)!] as const);
  }, [permissions.data]);

  function openCreate() {
    setSelected(null); setRoleId(roles.data?.find((r) => r.managedId === "CLERK") ? String(roles.data.find((r) => r.managedId === "CLERK")!.id) : ""); setError(null); setPanel("create");
  }
  function openEdit(row: StaffUser) { setSelected(row); setRoleId(row.roleId ? String(row.roleId) : ""); setError(null); setPanel("edit"); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const fd = new FormData(event.currentTarget);
    try {
      if (panel === "create") {
        await api.post("/api/users", { name: String(fd.get("name") || "").trim(), username: String(fd.get("username") || "").trim(), email: String(fd.get("email") || "").trim() || undefined, password: String(fd.get("password") || ""), roleId: roleId ? Number(roleId) : undefined, isAdmin: false });
      } else if (selected) {
        await api.put(`/api/users/${selected.id}`, { name: String(fd.get("name") || "").trim(), email: String(fd.get("email") || "").trim() || undefined, roleId: roleId ? Number(roleId) : null });
      }
      setPanel(null); await users.reload();
    } catch (cause) { setError(apiFailureMessage(cause, "Could not save staff account.", "Session expired")); }
    finally { setBusy(false); }
  }

  if (ready && !user?.isAdmin) return <UserSettingsScaffold><div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">Only a store administrator or authorised store manager can manage staff access.</div></UserSettingsScaffold>;

  return <UserSettingsScaffold>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-sm text-[var(--oh-muted)]">Create staff accounts and assign a role template. Permissions are inherited from the selected role.</p></div>
      <button type="button" onClick={openCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]"><UserPlus size={17} /> Add staff</button>
    </div>
    <div className="mt-5 flex flex-col gap-3 sm:flex-row"><input aria-label="Search staff" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, username or email" className="h-11 w-full max-w-md rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-sm outline-none focus:border-[var(--oh-primary)]" /></div>
    <AsyncState loading={users.loading} error={users.error} empty={!visible.length} emptyText="No staff accounts found." onRetry={users.reload}>
      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white"><table className="w-full text-left text-sm"><thead className="bg-[var(--oh-surface)] text-xs uppercase tracking-wide text-[var(--oh-muted)]"><tr><th className="px-4 py-3">Staff member</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{visible.map((row) => <tr key={row.id} className="hover:bg-sky-50/40"><td className="px-4 py-3"><p className="font-semibold text-[var(--oh-text)]">{row.name || row.username}</p><p className="text-xs text-[var(--oh-muted)]">{row.email || row.username}</p></td><td className="px-4 py-3 text-[var(--oh-text-secondary)]">{row.isAdmin ? "Administrator" : roles.data?.find((role) => role.id === row.roleId)?.name || "Staff"}</td><td className="px-4 py-3">{row.pendingPasswordReset ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">Invite pending</span> : <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">Active</span>}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => openEdit(row)} className="min-h-10 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold text-[var(--oh-primary)]">Configure</button></td></tr>)}</tbody></table></div>
    </AsyncState>

    {panel && <div role="presentation" className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.currentTarget === e.target && !busy) setPanel(null); }}><div role="dialog" aria-modal="true" aria-labelledby="staff-dialog-title" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-[var(--oh-surface-elevated)] p-5 shadow-2xl sm:rounded-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 id="staff-dialog-title" className="text-xl font-semibold text-[var(--oh-text)]">{panel === "create" ? "Add staff account" : "Configure staff"}</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Role templates keep access consistent across the store.</p></div><button type="button" aria-label="Close" onClick={() => !busy && setPanel(null)} className="grid size-10 place-items-center rounded-lg hover:bg-[var(--oh-surface)]"><X size={18} /></button></div><form onSubmit={submit} className="mt-5 grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">Name<input name="name" required defaultValue={selected?.name || ""} className="h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3" /></label><label className="grid gap-1.5 text-sm font-medium">Email<input name="email" type="email" defaultValue={selected?.email || ""} className="h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3" /></label></div>{panel === "create" && <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">Username<input name="username" required autoCapitalize="none" className="h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3" /></label><label className="grid gap-1.5 text-sm font-medium">Temporary password<input name="password" required minLength={12} type="password" className="h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3" /></label></div>}<label className="grid gap-1.5 text-sm font-medium">Role template<select value={roleId} onChange={(e) => setRoleId(e.target.value)} required className="h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3"><option value="">Select a role</option>{(roles.data ?? []).filter((role) => role.managedId !== "ADMIN").map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>{selectedRole && <section className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4"><div className="flex items-center gap-2"><ShieldCheck size={17} className="text-[var(--oh-primary)]" /><h3 className="font-semibold text-[var(--oh-text)]">Inherited permissions · {selectedRole.name}</h3></div><p className="mt-1 text-xs text-[var(--oh-muted)]">These permissions come from the role and apply to every staff member assigned to it.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{grouped.map(([section, items]) => <div key={section}><p className="text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">{section}</p><ul className="mt-1 space-y-1">{items.map((item) => <li key={item.id} className="text-sm text-[var(--oh-text-secondary)]">{item.name}</li>)}</ul></div>)}</div></section>}{error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setPanel(null)} disabled={busy} className="min-h-11 rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold">Cancel</button><button type="submit" disabled={busy || !roleId} className="min-h-11 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save staff"}</button></div></form></div></div>}
  </UserSettingsScaffold>;
}
