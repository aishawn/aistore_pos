"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Pencil, Plus, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { AdminPageLayout, AdminPrimaryButton } from "@/components/admin/AdminPageLayout";
import { AsyncState } from "@/components/admin/AsyncState";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Modal } from "@/components/admin/Modal";
import { useApi } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Role {
  id: string | number;
  name: string;
  managedId?: string | number | null;
}

interface Permission {
  id: number;
  name: string;
  safeName: string;
  section?: string | null;
}

interface StaffUser {
  id: string | number;
  roleId?: string | number | null;
  isAdmin?: boolean;
  admin?: boolean;
}

const BASE = "/api/roles";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export default function RolesPage() {
  const { user: currentUser } = useAuth();
  const rolesState = useApi<Role[]>(BASE);
  const permissionsState = useApi<Permission[]>("/api/permissions");
  const usersState = useApi<StaffUser[]>("/api/users");
  const roles = useMemo(() => rolesState.data ?? [], [rolesState.data]);
  const permissions = useMemo(() => permissionsState.data ?? [], [permissionsState.data]);
  const users = usersState.data ?? [];
  const roleKey = useMemo(() => roles.map((role) => String(role.id)).join("|"), [roles]);

  const [rolePermissionSnapshot, setRolePermissionSnapshot] = useState<{
    key: string;
    byRole: Record<string, string[] | null>;
  }>({ key: "", byRole: {} });
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>([]);
  const [loadingRolePermissions, setLoadingRolePermissions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<Role | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const permissionGroups = useMemo(() => {
    const groups = new Map<string, Permission[]>();
    for (const permission of permissions) {
      const section = permission.section?.trim() || "General";
      groups.set(section, [...(groups.get(section) ?? []), permission]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  useEffect(() => {
    if (!roles.length) return;
    let cancelled = false;
    void Promise.all(roles.map(async (role) => {
      try {
        const assigned = await api.get<Permission[]>(`${BASE}/${role.id}/permissions`);
        return [String(role.id), assigned.map((permission) => permission.name)] as const;
      } catch {
        return [String(role.id), null] as const;
      }
    })).then((entries) => {
      if (!cancelled) {
        setRolePermissionSnapshot({
          key: roleKey,
          byRole: Object.fromEntries(entries),
        });
      }
    });
    return () => { cancelled = true; };
  }, [roles, roleKey]);

  function openCreate() {
    setEditing(null);
    setName("");
    setSelectedPermissionIds([]);
    setEditorError(null);
    setCreating(true);
  }

  async function openEdit(role: Role) {
    setEditing(role);
    setCreating(false);
    setName(role.name);
    setSelectedPermissionIds([]);
    setEditorError(null);
    setLoadingRolePermissions(true);
    try {
      const assigned = await api.get<Permission[]>(`${BASE}/${role.id}/permissions`);
      setSelectedPermissionIds(assigned.map((permission) => permission.id));
    } catch (error) {
      setEditorError(errorMessage(error, "Could not load this role's permissions."));
    } finally {
      setLoadingRolePermissions(false);
    }
  }

  function closeEditor() {
    if (saving) return;
    setCreating(false);
    setEditing(null);
    setEditorError(null);
  }

  function togglePermission(permissionId: number) {
    setSelectedPermissionIds((current) => current.includes(permissionId)
      ? current.filter((id) => id !== permissionId)
      : [...current, permissionId]);
  }

  async function saveRole() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setEditorError("Enter a role name.");
      return;
    }
    setSaving(true);
    setEditorError(null);
    try {
      const body = { name: trimmedName, permissionIds: selectedPermissionIds };
      if (editing) await api.put(`${BASE}/${editing.id}`, body);
      else await api.post(BASE, body);
      await Promise.all([rolesState.reload(), usersState.reload()]);
      setCreating(false);
      setEditing(null);
    } catch (error) {
      setEditorError(errorMessage(error, "Could not save this role."));
    } finally {
      setSaving(false);
    }
  }

  async function removeRole(role: Role, userCount: number) {
    if (userCount > 0) return;
    setDeletingId(String(role.id));
    setPageError(null);
    try {
      await api.del(`${BASE}/${role.id}`);
      await rolesState.reload();
      setConfirmingDelete(null);
    } catch (error) {
      setPageError(errorMessage(error, "Could not delete this role."));
      setConfirmingDelete(null);
    } finally {
      setDeletingId(null);
    }
  }

  if (!currentUser?.isAdmin) {
    return (
      <AdminPageLayout title="Roles & Permissions" subtitle="Store administrators can manage staff access.">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          You need store administrator access to view or change roles and permissions.
        </div>
      </AdminPageLayout>
    );
  }

  const pageLoading = rolesState.loading || permissionsState.loading || usersState.loading;
  const loadError = rolesState.error || permissionsState.error || usersState.error;

  return (
    <AdminPageLayout
      title="Roles & Permissions"
      subtitle="Give each staff role only the access needed for their work."
      count={roles.length}
      countLabel="Roles"
      actions={
        <AdminPrimaryButton onClick={openCreate} disabled={permissionsState.loading || Boolean(permissionsState.error)} className="min-h-11">
          <Plus size={16} aria-hidden="true" /> New role
        </AdminPrimaryButton>
      }
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex items-start gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 text-sm text-[var(--oh-text-secondary)] shadow-[var(--oh-shadow-card)]">
          <ShieldCheck className="mt-0.5 shrink-0 text-[var(--oh-primary)]" size={19} aria-hidden="true" />
          <p>New roles start with no permissions. AI report permissions can expose sales or cost reports; review each grant before saving.</p>
        </div>

        {pageError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{pageError}</p>}

        <AsyncState
          loading={pageLoading}
          error={loadError}
          empty={roles.length === 0}
          emptyText="No staff roles yet. Create a role before inviting staff who need non-administrator permissions."
        >
            <ul className="grid gap-3 xl:hidden">
              {roles.map((role) => {
                const roleUsers = users.filter((staff) => String(staff.roleId ?? "") === String(role.id));
                const assignedPermissions = rolePermissionSnapshot.byRole[String(role.id)];
                return (
                  <li key={String(role.id)} className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="min-w-0 break-words text-sm font-semibold text-[var(--oh-text)]">{role.name}</h2>
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--oh-surface)] px-2.5 py-1 text-xs font-medium text-[var(--oh-text-secondary)]">
                        <UsersRound size={14} aria-hidden="true" /> {roleUsers.length} staff
                      </span>
                    </div>
                    <div className="mt-4 border-t border-[var(--oh-border)] pt-3">
                      <h3 className="text-xs font-semibold text-[var(--oh-muted)]">Permissions</h3>
                      {rolePermissionSnapshot.key !== roleKey ? (
                        <p className="mt-2 text-sm text-[var(--oh-muted)]">Loading access…</p>
                      ) : assignedPermissions === null ? (
                        <p className="mt-2 text-sm text-red-800">Could not load permissions</p>
                      ) : assignedPermissions?.length ? (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {assignedPermissions.map((permissionName) => (
                            <li key={permissionName} className="rounded-full bg-[var(--oh-surface)] px-2.5 py-1 text-xs font-medium text-[var(--oh-text-secondary)]">{permissionName}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-[var(--oh-muted)]">No permissions assigned</p>
                      )}
                    </div>
                    <div className="mt-4 flex gap-2 border-t border-[var(--oh-border)] pt-3">
                      <button type="button" onClick={() => void openEdit(role)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">
                        <Pencil size={15} aria-hidden="true" /> Edit access
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(role)}
                        disabled={roleUsers.length > 0 || deletingId === String(role.id)}
                        title={roleUsers.length > 0 ? "Reassign staff before deleting this role" : "Delete role"}
                        aria-label={`Delete ${role.name} role`}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--oh-border)] text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700"
                      >
                        {deletingId === String(role.id) ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} aria-hidden="true" />}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] xl:block">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-[var(--oh-surface)] text-xs uppercase tracking-wide text-[var(--oh-muted)]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Permissions</th>
                    <th className="px-4 py-3 font-semibold">Staff</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => {
                    const roleUsers = users.filter((staff) => String(staff.roleId ?? "") === String(role.id));
                    const isAssigned = roleUsers.length > 0;
                    return (
                      <tr key={String(role.id)} className="border-t border-[var(--oh-border)]/70">
                        <td className="px-4 py-4 font-semibold text-[var(--oh-text)]">{role.name}</td>
                        <td className="px-4 py-4 text-[var(--oh-text-secondary)]">
                          {rolePermissionSnapshot.key !== roleKey ? (
                            <span className="text-[var(--oh-muted)]">Loading access…</span>
                          ) : rolePermissionSnapshot.byRole[String(role.id)] === null ? (
                            <span className="text-red-800">Could not load permissions</span>
                          ) : rolePermissionSnapshot.byRole[String(role.id)]?.length ? (
                            <div className="flex flex-wrap gap-1.5">
                              {rolePermissionSnapshot.byRole[String(role.id)]?.map((permissionName) => (
                                <span key={permissionName} className="rounded-full bg-[var(--oh-surface)] px-2 py-1 text-xs font-medium text-[var(--oh-text-secondary)]">{permissionName}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[var(--oh-muted)]">No permissions assigned</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-[var(--oh-text-secondary)]">
                          <span className="inline-flex items-center gap-1.5"><UsersRound size={15} aria-hidden="true" />{roleUsers.length}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => void openEdit(role)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">
                              <Pencil size={15} aria-hidden="true" /> Edit access
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingDelete(role)}
                              disabled={isAssigned || deletingId === String(role.id)}
                              title={isAssigned ? "Reassign staff before deleting this role" : "Delete role"}
                              aria-label={`Delete ${role.name} role`}
                              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--oh-border)] text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700"
                            >
                              {deletingId === String(role.id) ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} aria-hidden="true" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </AsyncState>
      </div>

      {(creating || editing) && (
        <Modal title={editing ? "Edit role access" : "Create role"} onClose={closeEditor} footer={
          <>
            <button type="button" onClick={closeEditor} disabled={saving} className="min-h-11 rounded-md border border-neutral-300 px-5 text-sm font-semibold text-neutral-700 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={() => void saveRole()} disabled={saving || loadingRolePermissions || !permissionsState.data} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60">
              {saving && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}{saving ? "Saving…" : "Save role"}
            </button>
          </>
        }>
          <div className="flex flex-col gap-5">
            <label className="grid gap-1.5 text-sm font-semibold text-[var(--oh-text-secondary)]">
              Role name
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoFocus className="h-11 rounded-md border border-[var(--oh-border-strong)] px-3 text-base font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
            </label>
            <fieldset disabled={loadingRolePermissions || saving} className="grid gap-3">
              <legend className="text-sm font-semibold text-[var(--oh-text)]">Permissions</legend>
              {loadingRolePermissions ? (
                <div className="flex min-h-20 items-center justify-center gap-2 text-sm text-[var(--oh-muted)]"><LoaderCircle size={16} className="animate-spin" />Loading permissions…</div>
              ) : permissionGroups.length === 0 ? (
                <p className="rounded-lg bg-[var(--oh-surface)] p-3 text-sm text-[var(--oh-muted)]">No permissions are available for this store.</p>
              ) : permissionGroups.map(([section, items]) => (
                <section key={section} className="rounded-lg border border-[var(--oh-border)] p-3">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--oh-muted)]">{section}</h3>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {items.map((permission) => (
                      <label key={permission.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]">
                        <input type="checkbox" checked={selectedPermissionIds.includes(permission.id)} onChange={() => togglePermission(permission.id)} className="h-4 w-4 accent-[var(--oh-primary)]" />
                        <span>{permission.name}</span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </fieldset>
            {editorError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{editorError}</p>}
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!confirmingDelete}
        title="Delete role"
        message={confirmingDelete ? `Delete the “${confirmingDelete.name}” role? This cannot be undone.` : ""}
        confirmLabel="Delete role"
        busy={deletingId === String(confirmingDelete?.id ?? "")}
        onConfirm={() => {
          if (!confirmingDelete) return;
          const userCount = users.filter((staff) => String(staff.roleId ?? "") === String(confirmingDelete.id)).length;
          void removeRole(confirmingDelete, userCount);
        }}
        onCancel={() => {
          if (!deletingId) setConfirmingDelete(null);
        }}
      />
    </AdminPageLayout>
  );
}
