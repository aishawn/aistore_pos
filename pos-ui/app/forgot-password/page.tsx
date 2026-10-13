"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { OrithosLogo } from "@/components/OrithosLogo";
import { api, ApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [mailConfigured, setMailConfigured] = useState(true);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ message: string; mailConfigured?: boolean }>(
        "/api/auth/forgot-password",
        { identifier: identifier.trim() },
      );
      setMailConfigured(result.mailConfigured !== false);
      setDone(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not start a password reset. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[var(--oh-surface)] px-5 py-6 text-[var(--oh-text)] sm:px-8 sm:py-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-full max-w-xl bg-[linear-gradient(135deg,var(--oh-orange-muted),transparent_55%)]" />

      <header className="relative z-10 mx-auto flex w-full max-w-lg items-center justify-between">
        <OrithosLogo />
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-[var(--oh-text-secondary)] transition-colors hover:text-[var(--oh-orange-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to sign in
        </Link>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 items-center py-10">
        <section className="w-full rounded-xl border border-[var(--oh-border)] bg-white p-6 shadow-[var(--oh-shadow-card)] sm:p-8">
          {done ? (
            <div className="grid gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-lg bg-[var(--oh-tile-blue-bg)] text-[var(--oh-primary)]">
                <MailCheck size={22} aria-hidden="true" />
              </span>
              <h1 className="text-2xl font-bold tracking-[-.035em] text-[var(--oh-text)]">Check your inbox</h1>
              <p className="text-sm leading-6 text-[var(--oh-muted)]">
                If an Orithos account matches those details, password reset instructions have been sent.
                {!mailConfigured && (
                  <> If email delivery is not configured for this store, ask your administrator to issue a reset link from Users settings.</>
                )}
              </p>
              <Link
                href="/login"
                className="mt-2 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--oh-primary)] px-5 text-sm font-bold text-white hover:bg-[var(--oh-primary-hover)]"
              >
                Return to sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold tracking-[-.035em] text-[var(--oh-text)]">Forgot password</h1>
                <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">
                  Enter your username or work email. We&apos;ll send a reset link when email is configured for your store.
                </p>
              </div>

              <form onSubmit={onSubmit} className="grid gap-5">
                <label htmlFor="identifier" className="grid gap-2 text-sm font-semibold text-[var(--oh-text-secondary)]">
                  Username or email
                  <input
                    id="identifier"
                    name="identifier"
                    type="text"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    autoFocus
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    maxLength={120}
                    className="h-12 w-full rounded-md border border-[var(--oh-border-strong)] bg-white px-3 text-base font-normal text-[var(--oh-text)] outline-none transition-shadow placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-primary)] focus:ring-3 focus:ring-[var(--oh-primary)]/20"
                  />
                </label>

                {error && (
                  <p className="rounded-md border border-[var(--oh-tile-red-border)] bg-[var(--oh-tile-red-bg)] px-3 py-2.5 text-sm leading-5 text-[var(--oh-tile-red-text)]" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="mt-1 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--oh-primary)] px-5 font-bold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-70"
                >
                  {busy ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
