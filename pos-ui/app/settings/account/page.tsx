"use client";

import { useState } from "react";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function AccountSecurityPage() {
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

  return (
    <main className="mx-auto flex h-full w-full max-w-5xl flex-col gap-5 overflow-y-auto bg-[var(--oh-surface)] p-4 md:p-7">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-primary)]">Your account</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--oh-text)]">Profile &amp; security</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--oh-muted)]">Manage your Orithos sign-in and password. Odoo uses a separate staff account connected under Integrations.</p>
      </header>

      {user?.pendingPasswordReset && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">Your administrator asked you to change your password before continuing.</div>}

      <section className="rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-50 text-[var(--sf-tab-blue)]"><ShieldCheck size={20} /></span>
          <div>
            <h2 className="text-base font-semibold text-[var(--oh-text)]">Account details</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">Your administrator manages account name, email and store access.</p>
          </div>
        </div>
        <dl className="mt-5 grid gap-4 border-t border-[var(--oh-border)] pt-4 sm:grid-cols-3">
          <div><dt className="text-xs font-medium uppercase tracking-wide text-[var(--oh-muted)]">Name</dt><dd className="mt-1 text-sm font-medium text-[var(--oh-text)]">{user?.name || "—"}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-[var(--oh-muted)]">Username</dt><dd className="mt-1 text-sm font-medium text-[var(--oh-text)]">{user?.username || "—"}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-[var(--oh-muted)]">Email</dt><dd className="mt-1 break-all text-sm font-medium text-[var(--oh-text)]">{user?.email || "Not set"}</dd></div>
        </dl>
      </section>

      <section className="rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#fff2da] text-[#8b4a00]"><KeyRound size={20} /></span>
          <div>
            <h2 className="text-base font-semibold text-[var(--oh-text)]">Change password</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">Use at least 12 characters. Your current password is required to confirm this change.</p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-5 grid max-w-2xl gap-4 border-t border-[var(--oh-border)] pt-5">
          <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text-secondary)]">Current password
            <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required maxLength={256} className="h-11 rounded-md border border-[var(--oh-border-strong)] bg-white px-3 text-base text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange-dark)] focus:ring-2 focus:ring-orange-100" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text-secondary)]">New password
              <input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={12} maxLength={72} className="h-11 rounded-md border border-[var(--oh-border-strong)] bg-white px-3 text-base text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange-dark)] focus:ring-2 focus:ring-orange-100" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text-secondary)]">Confirm new password
              <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={12} maxLength={72} className="h-11 rounded-md border border-[var(--oh-border-strong)] bg-white px-3 text-base text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange-dark)] focus:ring-2 focus:ring-orange-100" />
            </label>
          </div>

          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{error}</p>}
          {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">{notice}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-5 text-[var(--oh-muted)]">Forgot your current password? Contact your store administrator to reset it.</p>
            <button type="submit" disabled={busy} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-wait disabled:opacity-60">
              {busy && <LoaderCircle size={16} className="animate-spin" />}{busy ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
