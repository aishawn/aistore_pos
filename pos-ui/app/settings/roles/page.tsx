"use client";

import { useEffect, useState } from "react";
import { StoreSettingsPage as AdminPageLayout } from "@/components/admin/StoreSettingsPage";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Role = { id: number; name: string; managedId?: string | null };
type Permission = { id: number; name: string; safeName: string; section?: string };

export default function RolesPermissionsPage() {
  const { hasPermission, ready } = useAuth();
  const canRead = ready && hasPermission("settings.permissions");
  const [roles, setRoles] = useState<Role[]>([]);
  const [selected, setSelected] = useState<number | "">("");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    void api.get<Role[]>("/api/roles")
      .then((rows) => {
        setRoles(Array.isArray(rows) ? rows : []);
        if (rows?.[0]) setSelected(rows[0].id);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load roles"));
  }, [canRead]);

  useEffect(() => {
    if (!selected) return;
    void api.get<Permission[]>(`/api/roles/${selected}/permissions`)
      .then((rows) => setPermissions(Array.isArray(rows) ? rows : []))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load permissions"));
  }, [selected]);

  if (!canRead) {
    return (
      <AdminPageLayout title="Roles & Permissions" subtitle="Access control">
        <p className="text-sm text-[var(--oh-muted)]">Permission to manage staff access is required.</p>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout title="Roles & Permissions" subtitle="Inspect role permission sets stored in Orithos">
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      <label className="grid max-w-md gap-1 text-sm font-medium">Role
        <select className="h-10 rounded-lg border px-3" value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
          {roles.map((role) => <option key={role.id} value={role.id}>{role.name}{role.managedId ? ` (${role.managedId})` : ""}</option>)}
        </select>
      </label>
      <ul className="mt-4 divide-y rounded-xl border border-[var(--oh-border)] bg-white">
        {permissions.map((permission) => (
          <li key={permission.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span>{permission.name}</span>
            <code className="text-xs text-[var(--oh-muted)]">{permission.safeName}</code>
          </li>
        ))}
        {permissions.length === 0 && <li className="px-4 py-8 text-center text-sm text-[var(--oh-muted)]">No permissions on this role.</li>}
      </ul>
    </AdminPageLayout>
  );
}
