"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw, Save, ShieldCheck, UsersRound } from "lucide-react";
import { AdminPageLayout, AdminPrimaryButton, AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { useApi } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface Role {
  id: string | number;
  name: string;
  managedId?: string | null;
}

interface Permission {
  id: number;
  name: string;
  safeName: string;
  section?: string | null;
}

interface StaffUser {
  id: string | number;
  name?: string;
  username?: string;
  roleId?: string | number | null;
  isAdmin?: boolean;
  admin?: boolean;
}

const BASE = "/api/roles";
const ROLE_ORDER = ["ADMIN", "MANAGER", "CLERK"] as const;
const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "店长 (Manager)",
  CLERK: "店员 (Clerk)",
};
const ROLE_SUMMARIES: Record<string, string> = {
  ADMIN: "Full store access, including integrations and data tools. Cannot be reduced on this page.",
  MANAGER: "Store operations plus staff invites and clerk permission edits. Integrations and data purge stay admin-only.",
  CLERK: "Only the operations switched on below. Admin and 店长 can change this matrix.",
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function managedCode(role: Role | null | undefined) {
  return String(role?.managedId ?? "").trim().toUpperCase();
}

function staffIsAdmin(user: StaffUser) {
  return Boolean(user.isAdmin ?? user.admin);
}

export default function PermissionsPage() {
  const { user: currentUser, hasPermission } = useAuth();
  const canManage = Boolean(currentUser?.isAdmin || hasPermission("settings.permissions"));

  const rolesState = useApi<Role[]>(canManage ? BASE : null);
  const permissionsState = useApi<Permission[]>(canManage ? "/api/permissions" : null);
  const usersState = useApi<StaffUser[]>(canManage ? "/api/users" : null);

  const roles = useMemo(() => {
    const list = rolesState.data ?? [];
    return [...list].sort((a, b) => {
      const ai = ROLE_ORDER.indexOf(managedCode(a) as (typeof ROLE_ORDER)[number]);
      const bi = ROLE_ORDER.indexOf(managedCode(b) as (typeof ROLE_ORDER)[number]);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
  }, [rolesState.data]);

  const permissions = useMemo(() => permissionsState.data ?? [], [permissionsState.data]);
  const users = usersState.data ?? [];

  const [selectedCode, setSelectedCode] = useState<string>("CLERK");
  const selectedRole = useMemo(
    () => roles.find((role) => managedCode(role) === selectedCode) ?? roles[0] ?? null,
    [roles, selectedCode],
  );
  const selectedManaged = managedCode(selectedRole);
  const clerkEditable = selectedManaged === "CLERK";

  const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>([]);
  const [baselineIds, setBaselineIds] = useState<number[]>([]);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");
  const [pageError, setPageError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const permissionGroups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const groups = new Map<string, Permission[]>();
    for (const permission of permissions) {
      if (q && !permission.name.toLowerCase().includes(q) && !permission.safeName.toLowerCase().includes(q)) {
        continue;
      }
      const section = permission.section?.trim() || "General";
      groups.set(section, [...(groups.get(section) ?? []), permission]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions, filter]);

  const dirty = useMemo(() => {
    if (!clerkEditable) return false;
    if (selectedPermissionIds.length !== baselineIds.length) return true;
    const baseline = new Set(baselineIds);
    return selectedPermissionIds.some((id) => !baseline.has(id));
  }, [baselineIds, clerkEditable, selectedPermissionIds]);

  useEffect(() => {
    if (!selectedRole) return;
    let cancelled = false;
    setLoadingMatrix(true);
    setPageError(null);
    setSaveNotice(null);
    void api.get<Permission[]>(`${BASE}/${selectedRole.id}/permissions`)
      .then((assigned) => {
        if (cancelled) return;
        const ids = assigned.map((permission) => permission.id);
        setSelectedPermissionIds(ids);
        setBaselineIds(ids);
      })
      .catch((error) => {
        if (cancelled) return;
        setSelectedPermissionIds([]);
        setBaselineIds([]);
        setPageError(errorMessage(error, "Could not load this role's permissions."));
      })
      .finally(() => {
        if (!cancelled) setLoadingMatrix(false);
      });
    return () => { cancelled = true; };
  }, [selectedRole?.id]);

  function roleStaff(role: Role) {
    const code = managedCode(role);
    if (code === "ADMIN") {
      return users.filter((staff) => staffIsAdmin(staff));
    }
    return users.filter((staff) => !staffIsAdmin(staff) && String(staff.roleId ?? "") === String(role.id));
  }

  function togglePermission(permissionId: number) {
    if (!clerkEditable || saving) return;
    setSelectedPermissionIds((current) => current.includes(permissionId)
      ? current.filter((id) => id !== permissionId)
      : [...current, permissionId]);
    setSaveNotice(null);
  }

  async function saveClerkMatrix() {
    if (!selectedRole || !clerkEditable) return;
    setSaving(true);
    setPageError(null);
    setSaveNotice(null);
    try {
      await api.put(`${BASE}/${selectedRole.id}/permissions`, selectedPermissionIds);
      setBaselineIds(selectedPermissionIds);
      setSaveNotice("Clerk permissions saved. Staff need to sign in again for JWT claims to refresh; live checks use the database.");
    } catch (error) {
      setPageError(errorMessage(error, "Could not save clerk permissions."));
    } finally {
      setSaving(false);
    }
  }

  function resetMatrix() {
    setSelectedPermissionIds(baselineIds);
    setSaveNotice(null);
  }

  if (!canManage) {
    return (
      <AdminPageLayout title="Permissions" subtitle="Admin and 店长 can control clerk operation access.">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          You need permission to manage staff access to open this page.
        </div>
      </AdminPageLayout>
    );
  }

  const pageLoading = rolesState.loading || permissionsState.loading || usersState.loading;
  const loadError = rolesState.error || permissionsState.error || usersState.error;

  function reloadPage() {
    rolesState.reload();
    permissionsState.reload();
    usersState.reload();
  }

  return (
    <AdminPageLayout
      title="Permissions"
      subtitle="Fixed roles: Admin, 店长, and 店员. Only the clerk operation matrix is editable."
      count={roles.length || 3}
      countLabel="Roles"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex items-start gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 text-sm text-[var(--oh-text-secondary)] shadow-[var(--oh-shadow-card)]">
          <ShieldCheck className="mt-0.5 shrink-0 text-[var(--oh-primary)]" size={19} aria-hidden="true" />
          <p>Admin and 店长 keep fixed capabilities. Switch on the operations each 店员 may use — changes apply to every clerk account.</p>
        </div>

        {pageError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{pageError}</p>}
        {saveNotice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">{saveNotice}</p>}

        {pageLoading ? (
          <div role="status" aria-live="polite" aria-busy="true" className="grid gap-3 lg:grid-cols-[220px_1fr]">
            <div className="h-48 animate-pulse rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)]" />
            <div className="h-72 animate-pulse rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)]" />
          </div>
        ) : loadError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <span>{loadError}</span>
            <button type="button" onClick={reloadPage} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100">
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="rounded-xl border border-[var(--oh-border)] bg-white p-2 shadow-[var(--oh-shadow-card)]">
              <ul className="grid gap-1">
                {(roles.length ? roles : ROLE_ORDER.map((code) => ({ id: code, name: ROLE_LABELS[code], managedId: code }))).map((role) => {
                  const code = managedCode(role) || String(role.id);
                  const active = code === selectedManaged || code === selectedCode;
                  const count = roles.length ? roleStaff(role as Role).length : 0;
                  return (
                    <li key={String(role.id)}>
                      <button
                        type="button"
                        onClick={() => setSelectedCode(code)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-left text-sm font-semibold transition-colors",
                          active ? "bg-[var(--oh-orange-light)] text-[var(--oh-text)]" : "text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]",
                        )}
                      >
                        <span>{ROLE_LABELS[code] ?? role.name}</span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--oh-muted)]">
                          <UsersRound size={13} aria-hidden="true" />{count}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <section className="rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)]">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--oh-border)] pb-4">
                <div>
                  <h2 className="text-base font-semibold text-[var(--oh-text)]">{ROLE_LABELS[selectedManaged] ?? selectedRole?.name ?? "Role"}</h2>
                  <p className="mt-1 max-w-2xl text-sm text-[var(--oh-text-secondary)]">
                    {ROLE_SUMMARIES[selectedManaged] ?? "Managed store role."}
                  </p>
                </div>
                {clerkEditable && (
                  <div className="flex flex-wrap gap-2">
                    <AdminSecondaryButton type="button" onClick={resetMatrix} disabled={!dirty || saving || loadingMatrix}>
                      Reset
                    </AdminSecondaryButton>
                    <AdminPrimaryButton type="button" onClick={() => void saveClerkMatrix()} disabled={!dirty || saving || loadingMatrix}>
                      {saving ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
                      {saving ? "Saving…" : "Save clerk access"}
                    </AdminPrimaryButton>
                  </div>
                )}
              </div>

              {!clerkEditable ? (
                <div className="mt-4 rounded-lg border border-dashed border-[var(--oh-border-strong)] bg-[var(--oh-surface)] px-4 py-6 text-sm text-[var(--oh-text-secondary)]">
                  This role’s capabilities are fixed. Select <strong>店员 (Clerk)</strong> to turn operations on or off.
                </div>
              ) : (
                <>
                  <label className="mt-4 grid gap-1.5 text-sm font-semibold text-[var(--oh-text-secondary)]">
                    Search operations
                    <input
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                      placeholder="e.g. refund, receive, gift cards"
                      className="h-11 rounded-md border border-[var(--oh-border-strong)] px-3 text-base font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15"
                    />
                  </label>

                  {loadingMatrix ? (
                    <div className="mt-6 flex min-h-24 items-center justify-center gap-2 text-sm text-[var(--oh-muted)]">
                      <LoaderCircle size={16} className="animate-spin" /> Loading permissions…
                    </div>
                  ) : permissionGroups.length === 0 ? (
                    <p className="mt-6 text-sm text-[var(--oh-muted)]">No permissions match this search.</p>
                  ) : (
                    <div className="mt-4 grid gap-3">
                      {permissionGroups.map(([section, items]) => (
                        <section key={section} className="rounded-lg border border-[var(--oh-border)] p-3">
                          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--oh-muted)]">{section}</h3>
                          <div className="grid gap-1 sm:grid-cols-2">
                            {items.map((permission) => (
                              <label
                                key={permission.id}
                                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedPermissionIds.includes(permission.id)}
                                  onChange={() => togglePermission(permission.id)}
                                  disabled={saving}
                                  className="h-4 w-4 accent-[var(--oh-primary)]"
                                />
                                <span>
                                  <span className="block font-medium text-[var(--oh-text)]">{permission.name}</span>
                                  <span className="block text-xs text-[var(--oh-muted)]">{permission.safeName}</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </>
              )}

              {selectedRole && (
                <div className="mt-6 border-t border-[var(--oh-border)] pt-4">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--oh-muted)]">Staff on this role</h3>
                  {roleStaff(selectedRole).length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--oh-muted)]">No staff assigned yet.</p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {roleStaff(selectedRole).map((staff) => (
                        <li key={String(staff.id)} className="rounded-full bg-[var(--oh-surface)] px-3 py-1.5 text-xs font-medium text-[var(--oh-text-secondary)]">
                          {staff.name || staff.username || `User ${staff.id}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </AdminPageLayout>
  );
}
