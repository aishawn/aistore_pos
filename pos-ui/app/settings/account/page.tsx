"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function AccountSecurityPage() {
  const params = useSearchParams();
  const tab = params.get("tab") || "security";
  const { user, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    if (newPassword.length < 12) {
      setError("Use at least 12 characters for your new password.");
      return;
    }
    if (new TextEncoder().encode(newPassword).length > 72) {
      setError("Use no more than 72 UTF-8 bytes. Long emoji or accented text can use more than one byte per character.");
      return;
    }

    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Your password has been updated. Other devices will need to sign in again when their current access token expires.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  }

  const tabs = [
    ["security", "Security"],
    ["developer", "Developer & API"],
    ["connection", "Connection status"],
  ] as const;
  return (
    <main className="mx-auto flex h-full w-full max-w-5xl flex-col gap-5 overflow-y-auto bg-[var(--oh-surface)] p-4 md:p-7">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-primary)]">Your account</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--oh-text)]">Profile &amp; security</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--oh-muted)]">Manage sign-in security, developer access, and live service connections.</p>
      </header>
      <nav className="flex gap-1 overflow-x-auto border-b border-[var(--oh-border)]" aria-label="Account sections">
        {tabs.map(([key, label]) => <Link key={key} href={`/settings/account?tab=${key}`} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${tab === key ? "border-[var(--oh-primary)] text-[var(--oh-primary)]" : "border-transparent text-[var(--oh-muted)]"}`}>{label}</Link>)}
      </nav>

      {tab === "developer" && <section className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-5 shadow-[var(--oh-shadow-card)] sm:p-6"><h2 className="text-base font-semibold text-[var(--oh-text)]">Developer &amp; API</h2><p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Store API access is being provisioned. When enabled, administrators will be able to create scoped keys for product, customer, supplier, and AI workflows. Keys are shown once and can be revoked immediately.</p><div className="mt-4 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-3 text-sm text-[var(--oh-muted)]">No API keys have been created.</div></section>}
      {tab === "connection" && <section className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-5 shadow-[var(--oh-shadow-card)] sm:p-6"><h2 className="text-base font-semibold text-[var(--oh-text)]">Connection status</h2><p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Live Odoo and AI capability checks are shown here. If a connection needs attention, contact your store administrator.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-md border border-[var(--oh-border)] p-4"><p className="text-sm font-semibold text-[var(--oh-text)]">Business data service</p><p className="mt-1 text-sm text-[var(--oh-muted)]">Checked when live data is requested.</p></div><div className="rounded-md border border-[var(--oh-border)] p-4"><p className="text-sm font-semibold text-[var(--oh-text)]">AI services</p><p className="mt-1 text-sm text-[var(--oh-muted)]">Available according to your role and tenant.</p></div></div></section>}

      {tab !== "security" ? null : <>

      {user?.pendingPasswordReset && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">Your administrator asked you to change your password before continuing.</div>}

      <section className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-5 shadow-[var(--oh-shadow-card)] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--brand-info-tint)] text-[var(--sf-tab-blue)]"><ShieldCheck size={20} /></span>
          <div>
            <h2 className="text-base font-semibold text-[var(--oh-text)]">Account details</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">Your administrator manages account name, email and store access.</p>
          </div>
        </div>
        <dl className="mt-5 grid gap-4 border-t border-[var(--oh-border)] pt-4 sm:grid-cols-3">
          <div><dt className="text-xs font-medium uppercase tracking-wide text-[var(--oh-muted)]">Name</dt><dd className="mt-1 break-words text-sm font-medium text-[var(--oh-text)]">{user?.name || "—"}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-[var(--oh-muted)]">Username</dt><dd className="mt-1 break-words text-sm font-medium text-[var(--oh-text)]">{user?.username || "—"}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-[var(--oh-muted)]">Email</dt><dd className="mt-1 break-all text-sm font-medium text-[var(--oh-text)]">{user?.email || "Not set"}</dd></div>
        </dl>
      </section>

      <section className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-5 shadow-[var(--oh-shadow-card)] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--brand-warning-tint)] text-[var(--oh-warning)]"><KeyRound size={20} /></span>
          <div>
            <h2 className="text-base font-semibold text-[var(--oh-text)]">Change password</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">Use at least 12 characters. Your current password is required to confirm this change.</p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-5 grid max-w-2xl gap-4 border-t border-[var(--oh-border)] pt-5">
          <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text-secondary)]">Current password
            <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required maxLength={256} className="h-11 rounded-md border border-[var(--oh-border-strong)] bg-[var(--oh-surface-elevated)] px-3 text-base text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange-dark)] focus:ring-2 focus:ring-[var(--oh-primary)]/20" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text-secondary)]">New password
              <input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={12} maxLength={72} className="h-11 rounded-md border border-[var(--oh-border-strong)] bg-[var(--oh-surface-elevated)] px-3 text-base text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange-dark)] focus:ring-2 focus:ring-[var(--oh-primary)]/20" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text-secondary)]">Confirm new password
              <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={12} maxLength={72} className="h-11 rounded-md border border-[var(--oh-border-strong)] bg-[var(--oh-surface-elevated)] px-3 text-base text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange-dark)] focus:ring-2 focus:ring-[var(--oh-primary)]/20" />
            </label>
          </div>

          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">{error}</p>}
          {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">{notice}</p>}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-xl text-xs leading-5 text-[var(--oh-muted)]">Forgot your current password? Use Forgot password on the sign-in page, or ask an administrator for a reset link.</p>
        <button type="submit" disabled={busy} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-60 sm:w-auto">
              {busy && <LoaderCircle size={16} className="animate-spin" />}{busy ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      </section>
      </>}
    </main>
  );
}
