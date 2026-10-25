"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, LoaderCircle } from "lucide-react";
import { OrithosLogo } from "@/components/OrithosLogo";
import { api, ApiError } from "@/lib/api";

type TokenInfo = {
  username: string;
  name?: string | null;
  purpose: string;
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [purpose, setPurpose] = useState("reset");
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextToken = params.get("token")?.trim() ?? "";
    const nextPurpose = params.get("purpose") === "invite" ? "invite" : "reset";
    setToken(nextToken);
    setPurpose(nextPurpose);
    if (!nextToken) {
      setLoadError("This link is missing a reset token.");
      setLoading(false);
      return;
    }
    let active = true;
    void api
      .get<TokenInfo>("/api/auth/reset-token", { token: nextToken, purpose: nextPurpose })
      .then((data) => {
        if (!active) return;
        setInfo(data);
      })
      .catch((cause) => {
        if (!active) return;
        setLoadError(cause instanceof ApiError ? cause.message : "This link is invalid or has expired.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    if (newPassword.length < 12) {
      setError("Use at least 12 characters for your new password.");
      return;
    }
    if (new TextEncoder().encode(newPassword).length > 72) {
      setError("Use no more than 72 UTF-8 bytes.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/auth/reset-password", { token, newPassword, purpose });
      router.replace("/login?reset=1");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  }

  const isInvite = purpose === "invite";

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[var(--oh-surface)] px-5 py-6 text-[var(--oh-text)] sm:px-8 sm:py-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-full max-w-xl bg-[linear-gradient(135deg,var(--oh-orange-muted),transparent_55%)]" />

      <header className="relative z-10 mx-auto flex w-full max-w-lg items-center justify-between">
        <OrithosLogo />
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-[var(--oh-text-secondary)] transition-colors hover:text-[var(--oh-primary)]"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Sign in
        </Link>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 items-center py-10">
        <section className="w-full rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-6 shadow-[var(--oh-shadow-card)] sm:p-8">
          {loading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-[var(--oh-muted)]">
              <LoaderCircle size={18} className="animate-spin" /> Checking link…
            </div>
          ) : loadError ? (
            <div className="grid gap-4">
              <h1 className="text-2xl font-bold tracking-[-.035em]">Link unavailable</h1>
              <p className="text-sm leading-6 text-[var(--oh-muted)]">{loadError}</p>
              <Link href="/forgot-password" className="text-sm font-semibold text-[var(--oh-primary)] underline underline-offset-2">
                Request a new reset link
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--oh-orange-light)] text-[var(--oh-primary)]">
                  <KeyRound size={20} aria-hidden="true" />
                </span>
                <div>
                  <h1 className="text-2xl font-bold tracking-[-.035em] text-[var(--oh-text)]">
                    {isInvite ? "Accept invite" : "Choose a new password"}
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">
                    {isInvite
                      ? `Set a password for ${info?.username ?? "your account"} to finish joining this store.`
                      : `Reset the password for ${info?.username ?? "your account"}.`}
                  </p>
                </div>
              </div>

              <form onSubmit={onSubmit} className="grid gap-4">
                <label className="grid gap-1.5 text-sm font-semibold text-[var(--oh-text-secondary)]">
                  New password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    minLength={12}
                    maxLength={72}
                    className="h-12 rounded-md border border-[var(--oh-border-strong)] bg-[var(--oh-surface-elevated)] px-3 text-base outline-none focus:border-[var(--oh-primary)] focus:ring-3 focus:ring-[var(--oh-primary)]/20"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[var(--oh-text-secondary)]">
                  Confirm new password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    minLength={12}
                    maxLength={72}
                    className="h-12 rounded-md border border-[var(--oh-border-strong)] bg-[var(--oh-surface-elevated)] px-3 text-base outline-none focus:border-[var(--oh-primary)] focus:ring-3 focus:ring-[var(--oh-primary)]/20"
                  />
                </label>
                <p className="text-xs leading-5 text-[var(--oh-muted)]">Use at least 12 characters.</p>

                {error && (
                  <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="mt-1 inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-5 font-bold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-70"
                >
                  {busy && <LoaderCircle size={16} className="animate-spin" />}
                  {busy ? "Saving…" : isInvite ? "Activate account" : "Update password"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
