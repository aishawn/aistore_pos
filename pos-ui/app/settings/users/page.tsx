"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { UserSettingsScaffold } from "@/components/admin/UserSettingsScaffold";
import { useAuth } from "@/lib/auth";
import { api, ApiError, apiFailureMessage } from "@/lib/api";
import { useApi } from "@/hooks/useApi";

interface StaffUser {
  id: string | number;
  name: string;
  username: string;
  email?: string | null;
  isAdmin?: boolean;
  /** Jackson may serialize Boolean isAdmin as `admin`. */
  admin?: boolean;
  pendingPasswordReset?: boolean;
  roleId?: string | number | null;
}

interface StaffRole {
  id: string | number;
  name: string;
  managedId?: string | null;
}

function staffIsAdmin(user: StaffUser): boolean {
  return Boolean(user.isAdmin ?? user.admin);
}

function roleLabel(role: StaffRole) {
  const code = String(role.managedId ?? "").toUpperCase();
  if (code === "ADMIN") return "Admin";
  if (code === "MANAGER") return "店长 (Manager)";
  if (code === "CLERK") return "店员 (Clerk)";
  return role.name;
}

interface InviteResult {
  inviteUrl: string;
  emailSent: boolean;
  mailConfigured: boolean;
  user: StaffUser;
}

interface ResetLinkResult {
  resetUrl: string;
  emailSent: boolean;
  mailConfigured: boolean;
}

export default function UsersSettingsPage() {
  const { user: currentUser, hasPermission } = useAuth();
  const canManageUsers = Boolean(currentUser?.isAdmin || hasPermission("settings.users"));
  const isStoreAdmin = Boolean(currentUser?.isAdmin);
  const { data, loading, error, reload } = useApi<StaffUser[]>(canManageUsers ? "/api/users" : null);
  const rolesState = useApi<StaffRole[]>(canManageUsers ? "/api/roles" : null);
  const users = useMemo(() => data ?? [], [data]);
  const roles = useMemo(() => {
    const list = rolesState.data ?? [];
    if (isStoreAdmin) return list;
    return list.filter((role) => String(role.managedId ?? "").toUpperCase() === "CLERK");
  }, [isStoreAdmin, rolesState.data]);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleId, setRoleId] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [lastResetUrl, setLastResetUrl] = useState<string | null>(null);

  const copyText = useCallback(async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 2000);
    } catch {
      setActionError("Could not copy to the clipboard. Select the link and copy it manually.");
    }
  }, []);

  async function onInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteBusy(true);
    setInviteError(null);
    setInviteNotice(null);
    setLastInviteUrl(null);
    try {
      const result = await api.post<InviteResult>("/api/auth/invite", {
        name: name.trim() || undefined,
        username: username.trim(),
        email: email.trim(),
        isAdmin,
        roleId: roleId ? Number(roleId) : undefined,
      });
      setLastInviteUrl(result.inviteUrl);
      setInviteNotice(
        result.emailSent
          ? `Invite sent to ${result.user.email}. You can also copy the link below.`
          : result.mailConfigured
            ? `Invite created for ${result.user.username}. Email could not be sent — copy the link below.`
            : `Invite created for ${result.user.username}. SMTP is not configured — copy and share the link below.`,
      );
      setName("");
      setUsername("");
      setEmail("");
      setIsAdmin(false);
      const clerk = roles.find((role) => String(role.managedId ?? "").toUpperCase() === "CLERK");
      setRoleId(clerk ? String(clerk.id) : "");
      reload();
    } catch (cause) {
      setInviteError(apiFailureMessage(cause, "Could not create the invite.", "Sign in again to invite staff."));
    } finally {
      setInviteBusy(false);
    }
  }

  async function issueReset(userId: string | number) {
    setActionBusyId(String(userId));
    setActionError(null);
    setActionNotice(null);
    setLastResetUrl(null);
    try {
      const result = await api.post<ResetLinkResult>(`/api/auth/users/${userId}/reset-link`);
      setLastResetUrl(result.resetUrl);
      setActionNotice(
        result.emailSent
          ? "Password reset email sent. You can also copy the link below."
          : result.mailConfigured
            ? "Reset link created. Email could not be sent — copy the link below."
            : "Reset link created. SMTP is not configured — copy and share the link below.",
      );
      reload();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : "Could not create a reset link.");
    } finally {
      setActionBusyId(null);
    }
  }

  if (!canManageUsers) {
    return (
      <UserSettingsScaffold>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Only store administrators and 店长 can invite staff or issue password reset links.
        </div>
      </UserSettingsScaffold>
    );
  }

  return (
    <UserSettingsScaffold>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)] sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--oh-tile-blue-bg)] text-[var(--oh-primary)]">
              <UserPlus size={20} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-[var(--oh-text)]">Invite staff</h2>
              <p className="mt-1 text-sm text-[var(--oh-muted)]">
                Create an Orithos account and send an activation link. The teammate sets their own password.
              </p>
            </div>
          </div>

          <form onSubmit={onInvite} className="mt-5 grid gap-4 border-t border-[var(--oh-border)] pt-5 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text-secondary)]">
              Display name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                className="h-11 rounded-md border border-[var(--oh-border-strong)] px-3 text-base outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text-secondary)]">
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                autoCapitalize="none"
                spellCheck={false}
                maxLength={120}
                className="h-11 rounded-md border border-[var(--oh-border-strong)] px-3 text-base outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text-secondary)] sm:col-span-2">
              Work email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={255}
                className="h-11 rounded-md border border-[var(--oh-border-strong)] px-3 text-base outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text-secondary)] sm:col-span-2">
              Staff role
              <select
                value={roleId}
                onChange={(event) => setRoleId(event.target.value)}
                required={!isAdmin}
                disabled={rolesState.loading || roles.length === 0}
                className="h-11 rounded-md border border-[var(--oh-border-strong)] bg-white px-3 text-base outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15 disabled:bg-[var(--oh-surface)]"
              >
                <option value="">{rolesState.loading ? "Loading roles…" : "Select a role"}</option>
                {roles.map((role) => <option key={String(role.id)} value={String(role.id)}>{roleLabel(role)}</option>)}
              </select>
              {rolesState.error ? (
                <span role="alert" className="flex flex-wrap items-center gap-2 font-normal text-red-800">
                  <span>Could not load staff roles: {rolesState.error}</span>
                  <button type="button" onClick={rolesState.reload} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 text-xs font-semibold text-red-900 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><RefreshCw size={13} /> Retry</button>
                </span>
              ) : roles.length === 0 && !rolesState.loading ? (
                <span className="font-normal text-[var(--oh-muted)]">Managed roles are still seeding. Open <a href="/settings/roles" className="font-semibold text-[var(--oh-primary)] underline">Permissions</a> after the API restarts.</span>
              ) : (
                <span className="font-normal text-[var(--oh-muted)]">{isStoreAdmin ? "Choose Admin, 店长, or 店员." : "店长 can invite 店员 only."}</span>
              )}
            </label>
            {isStoreAdmin && (
              <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--oh-text-secondary)] sm:col-span-2">
                <input
                  type="checkbox"
                  checked={isAdmin}
                  onChange={(event) => setIsAdmin(event.target.checked)}
                  className="h-4 w-4 accent-[var(--oh-primary)]"
                />
                Grant administrator access
              </label>
            )}

            {inviteError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 sm:col-span-2">{inviteError}</p>}
            {inviteNotice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 sm:col-span-2">{inviteNotice}</p>}
            {lastInviteUrl && (
              <div className="flex flex-col gap-2 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3 sm:col-span-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 break-all text-xs text-[var(--oh-text)]">{lastInviteUrl}</code>
                <button
                  type="button"
                  onClick={() => void copyText(lastInviteUrl, "invite")}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--oh-border-strong)] bg-white px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
                >
                  {copied === "invite" ? <Check size={16} /> : <Copy size={16} />}
                  {copied === "invite" ? "Copied" : "Copy link"}
                </button>
              </div>
            )}

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={inviteBusy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-60"
              >
                {inviteBusy && <LoaderCircle size={16} className="animate-spin" />}
                {inviteBusy ? "Creating invite…" : "Send invite"}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)] sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#fff2da] text-[#8b4a00]">
              <KeyRound size={20} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-[var(--oh-text)]">Store users</h2>
              <p className="mt-1 text-sm text-[var(--oh-muted)]">
                Issue a password reset link when a teammate is locked out. Share the link if SMTP is not configured.
              </p>
            </div>
          </div>

          {actionError && <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{actionError}</p>}
          {actionNotice && <p role="status" className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{actionNotice}</p>}
          {lastResetUrl && (
            <div className="mt-4 flex flex-col gap-2 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 break-all text-xs text-[var(--oh-text)]">{lastResetUrl}</code>
              <button
                type="button"
                onClick={() => void copyText(lastResetUrl, "reset")}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--oh-border-strong)] bg-white px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
              >
                {copied === "reset" ? <Check size={16} /> : <Copy size={16} />}
                {copied === "reset" ? "Copied" : "Copy link"}
              </button>
            </div>
          )}

          <div className="mt-5 border-t border-[var(--oh-border)]">
            {loading && !data ? (
        <div role="status" aria-live="polite" aria-busy="true" aria-label="Loading store users" className="py-4">
                <div className="hidden gap-3 xl:grid xl:grid-cols-6 xl:border-b xl:border-[var(--oh-border)] xl:px-2 xl:py-3">
                  {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-[var(--oh-surface)]" />)}
                </div>
                <div className="grid gap-3 xl:hidden">
                  {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-lg bg-[var(--oh-surface)]" />)}
                </div>
              </div>
            ) : error ? (
              <div className="py-6">
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm text-red-800">
                  <span>{error}</span>
                  <button type="button" onClick={reload} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-red-300 bg-white px-3 font-semibold text-red-900 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><RefreshCw size={15} /> Retry</button>
                </div>
                <div className="mt-4 xl:hidden">
                  <ul className="grid gap-3">
                    <li className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <h3 className="text-sm font-semibold text-amber-950">Store users are unavailable</h3>
                      <p className="mt-1 text-sm text-amber-900">Connect the staff directory before inviting or resetting a user. No user data was changed.</p>
                    </li>
                  </ul>
                </div>
                <div className="mt-4 hidden overflow-x-auto xl:block">
                  <table aria-label="Store users" className="w-full min-w-[820px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--oh-border)] text-xs uppercase tracking-wide text-[var(--oh-muted)]">
                        {(["Name", "Username", "Email", "Role", "Status", "Actions"] as const).map((heading) => <th key={heading} scope="col" className="px-2 py-3 font-semibold">{heading}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan={6} className="px-2 py-6 text-center text-sm text-[var(--oh-muted)]">The staff directory is unavailable. Retry after the connection is restored.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : users.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--oh-muted)]">No users yet. Invite the first teammate above.</p>
            ) : (
              <>
                <ul className="mt-4 grid gap-3 xl:hidden">
                  {users.map((staff) => {
                    const admin = staffIsAdmin(staff);
                    const roleName = admin
                      ? "Administrator"
                      : roles.find((role) => String(role.id) === String(staff.roleId ?? ""))?.name || "No role";
                    const busy = actionBusyId === String(staff.id);

                    return (
                      <li key={String(staff.id)} className="rounded-lg border border-[var(--oh-border)] bg-white p-4">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-[var(--oh-text)]">{staff.name || staff.username}</h3>
                            <p className="mt-0.5 break-all text-xs text-[var(--oh-muted)]">@{staff.username}</p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${staff.pendingPasswordReset ? "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200" : "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"}`}>
                            {staff.pendingPasswordReset ? "Set password" : "Active"}
                          </span>
                        </div>

                        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-[var(--oh-border)] pt-3 text-sm">
                          <div className="min-w-0">
                            <dt className="text-xs font-medium text-[var(--oh-muted)]">Email</dt>
                            <dd className="mt-0.5 break-all text-[var(--oh-text-secondary)]">{staff.email || "—"}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs font-medium text-[var(--oh-muted)]">Role</dt>
                            <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[var(--oh-text-secondary)]">
                              {roleName}
                              {admin && <span className="rounded bg-[var(--oh-tile-blue-bg)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--oh-primary)]">Admin</span>}
                            </dd>
                          </div>
                        </dl>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void issueReset(staff.id)}
                          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-60"
                        >
                          {busy ? <LoaderCircle size={15} className="animate-spin" /> : <KeyRound size={15} />}
                          {busy ? "Creating reset link…" : "Create reset link"}
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-2 hidden overflow-x-auto xl:block">
                  <table aria-label="Store users" className="w-full min-w-[820px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--oh-border)] text-xs uppercase tracking-wide text-[var(--oh-muted)]">
                        <th scope="col" className="px-2 py-3 font-semibold">Name</th>
                        <th scope="col" className="px-2 py-3 font-semibold">Username</th>
                        <th scope="col" className="px-2 py-3 font-semibold">Email</th>
                        <th scope="col" className="px-2 py-3 font-semibold">Role</th>
                        <th scope="col" className="px-2 py-3 font-semibold">Status</th>
                        <th scope="col" className="px-2 py-3 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((staff) => (
                        <tr key={String(staff.id)} className="border-b border-[var(--oh-border)]/70 last:border-0 hover:bg-[var(--oh-surface)]/60">
                          <th scope="row" className="px-2 py-3 font-medium text-[var(--oh-text)]">
                            {staff.name || staff.username}
                            {staffIsAdmin(staff) ? <span className="ml-2 rounded bg-[var(--oh-tile-blue-bg)] px-1.5 py-0.5 text-[11px] font-bold uppercase text-[var(--oh-primary)]">Admin</span> : null}
                          </th>
                          <td className="px-2 py-3 text-[var(--oh-text-secondary)]">{staff.username}</td>
                          <td className="max-w-[220px] break-all px-2 py-3 text-[var(--oh-text-secondary)]">{staff.email || "—"}</td>
                          <td className="px-2 py-3 text-[var(--oh-text-secondary)]">
                            {staffIsAdmin(staff) ? "Administrator" : roles.find((role) => String(role.id) === String(staff.roleId ?? ""))?.name || "No role"}
                          </td>
                          <td className="px-2 py-3 text-[var(--oh-muted)]">
                            {staff.pendingPasswordReset ? "Must set password" : "Active"}
                          </td>
                          <td className="px-2 py-3">
                            <button
                              type="button"
                              disabled={actionBusyId === String(staff.id)}
                              onClick={() => void issueReset(staff.id)}
                              className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-[var(--oh-border-strong)] px-3 text-xs font-semibold hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60"
                            >
                              {actionBusyId === String(staff.id) ? <LoaderCircle size={14} className="animate-spin" /> : <KeyRound size={14} />}
                              Reset link
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </UserSettingsScaffold>
  );
}
