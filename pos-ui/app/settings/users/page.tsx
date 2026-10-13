"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
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
}

function staffIsAdmin(user: StaffUser): boolean {
  return Boolean(user.isAdmin ?? user.admin);
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
  const { user: currentUser } = useAuth();
  const { data, loading, error, reload } = useApi<StaffUser[]>("/api/users");
  const users = useMemo(() => data ?? [], [data]);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
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

  if (!currentUser?.isAdmin) {
    return (
      <UserSettingsScaffold>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Only store administrators can invite staff or issue password reset links.
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
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--oh-text-secondary)] sm:col-span-2">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(event) => setIsAdmin(event.target.checked)}
                className="h-4 w-4 accent-[var(--oh-primary)]"
              />
              Grant administrator access
            </label>

            {inviteError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 sm:col-span-2">{inviteError}</p>}
            {inviteNotice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 sm:col-span-2">{inviteNotice}</p>}
            {lastInviteUrl && (
              <div className="flex flex-col gap-2 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3 sm:col-span-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 break-all text-xs text-[var(--oh-text)]">{lastInviteUrl}</code>
                <button
                  type="button"
                  onClick={() => void copyText(lastInviteUrl, "invite")}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--oh-border-strong)] bg-white px-3 text-sm font-semibold"
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
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-wait disabled:opacity-60"
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
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--oh-border-strong)] bg-white px-3 text-sm font-semibold"
              >
                {copied === "reset" ? <Check size={16} /> : <Copy size={16} />}
                {copied === "reset" ? "Copied" : "Copy link"}
              </button>
            </div>
          )}

          <div className="mt-5 overflow-x-auto border-t border-[var(--oh-border)]">
            {loading && !data ? (
              <p className="py-8 text-center text-sm text-[var(--oh-muted)]">Loading users…</p>
            ) : error ? (
              <p className="py-8 text-center text-sm text-red-800">{error}</p>
            ) : users.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--oh-muted)]">No users yet. Invite the first teammate above.</p>
            ) : (
              <table className="mt-2 w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--oh-border)] text-xs uppercase tracking-wide text-[var(--oh-muted)]">
                    <th className="px-2 py-3 font-semibold">Name</th>
                    <th className="px-2 py-3 font-semibold">Username</th>
                    <th className="px-2 py-3 font-semibold">Email</th>
                    <th className="px-2 py-3 font-semibold">Status</th>
                    <th className="px-2 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((staff) => (
                    <tr key={String(staff.id)} className="border-b border-[var(--oh-border)]/70">
                      <td className="px-2 py-3 font-medium text-[var(--oh-text)]">
                        {staff.name}
                        {staffIsAdmin(staff) ? <span className="ml-2 rounded bg-[var(--oh-tile-blue-bg)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--oh-primary)]">Admin</span> : null}
                      </td>
                      <td className="px-2 py-3 text-[var(--oh-text-secondary)]">{staff.username}</td>
                      <td className="px-2 py-3 break-all text-[var(--oh-text-secondary)]">{staff.email || "—"}</td>
                      <td className="px-2 py-3 text-[var(--oh-muted)]">
                        {staff.pendingPasswordReset ? "Must set password" : "Active"}
                      </td>
                      <td className="px-2 py-3">
                        <button
                          type="button"
                          disabled={actionBusyId === String(staff.id)}
                          onClick={() => void issueReset(staff.id)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--oh-border-strong)] px-3 text-xs font-semibold hover:bg-[var(--oh-surface)] disabled:opacity-60"
                        >
                          {actionBusyId === String(staff.id) ? <LoaderCircle size={14} className="animate-spin" /> : <KeyRound size={14} />}
                          Reset link
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </UserSettingsScaffold>
  );
}
