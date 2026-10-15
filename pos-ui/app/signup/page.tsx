"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { OrithosLogo } from "@/components/OrithosLogo";
import { api, apiFailureMessage } from "@/lib/api";
import {
  isControlPlaneHost,
  isReservedSlug,
  normalizeSlug,
  storeOrigin,
  tenantBaseDomain,
} from "@/lib/tenant-host";

interface AvailableResponse {
  available: boolean;
  slug: string;
  previewHost?: string | null;
}

interface SignupResponse {
  redirectHost: string;
  bootstrapToken: string;
  subdomain: string;
}

export default function SignupPage() {
  const [organisationName, setOrganisationName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const slug = useMemo(() => normalizeSlug(subdomain), [subdomain]);
  const preview = slug ? `${slug}.${tenantBaseDomain()}` : `{store}.${tenantBaseDomain()}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isControlPlaneHost(window.location.host)) {
      setBlocked(true);
    }
  }, []);

  useEffect(() => {
    if (!slug || isReservedSlug(slug)) {
      setAvailable(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void api.get<AvailableResponse>("/api/public/subdomain-available", { slug })
        .then((res) => { if (!cancelled) setAvailable(res.available); })
        .catch(() => { if (!cancelled) setAvailable(null); });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!slug || isReservedSlug(slug)) {
      setError("Choose a valid store subdomain.");
      return;
    }
    if (available === false) {
      setError("That subdomain is already taken.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<SignupResponse>("/api/public/signup", {
        organisationName: organisationName.trim(),
        subdomain: slug,
        ownerName: ownerName.trim() || username.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
      });
      const host = res.redirectHost || storeOrigin(res.subdomain);
      const url = new URL("/auth/bootstrap", host.endsWith("/") ? host : `${host}/`);
      url.searchParams.set("token", res.bootstrapToken);
      window.location.assign(url.toString());
    } catch (err) {
      setError(apiFailureMessage(err, "We couldn’t create your trial store.", "Session expired"));
    } finally {
      setBusy(false);
    }
  }

  if (blocked) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-[var(--oh-surface)] px-4 text-center">
        <OrithosLogo />
        <p className="mt-6 max-w-md text-sm text-[var(--oh-text-secondary)]">
          Start a free trial from the main Orithos app host, then we’ll open your store subdomain.
        </p>
        <Link href="/login" className="mt-4 text-sm font-semibold text-[var(--oh-primary)] hover:underline">
          Back to sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[var(--oh-surface)] px-4 py-8 font-sans text-[var(--oh-text)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(37,99,235,0.08),transparent_45%),radial-gradient(ellipse_at_90%_100%,rgba(37,99,235,0.05),transparent_40%)]"
      />
      <div className="relative z-10 mb-6">
        <OrithosLogo />
      </div>

      <section className="relative z-10 w-full max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-6 shadow-[var(--oh-shadow-card)] sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight">Start your free trial</h1>
        <p className="mt-1 text-sm text-[var(--oh-text-secondary)]">
          Pick a store address, create your owner account, and jump straight in.
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-[var(--oh-text-secondary)]">Store name</span>
            <input
              required
              value={organisationName}
              onChange={(e) => setOrganisationName(e.target.value)}
              maxLength={120}
              className="h-11 w-full rounded-md border border-[var(--oh-border-strong)] px-3 outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20"
              placeholder="Acme Cellars"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-[var(--oh-text-secondary)]">Store subdomain</span>
            <div className="flex h-11 items-center overflow-hidden rounded-md border border-[var(--oh-border-strong)] focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/20">
              <input
                required
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                maxLength={63}
                autoCapitalize="none"
                spellCheck={false}
                className="h-full min-w-0 flex-1 bg-transparent px-3 outline-none"
                placeholder="acme"
              />
              <span className="shrink-0 border-l border-[var(--oh-border)] px-3 text-xs text-[var(--oh-text-secondary)]">
                .{tenantBaseDomain()}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--oh-text-secondary)]">
              Your store: <span className="font-medium text-[var(--oh-text)]">{preview}</span>
              {slug && available === true && <span className="ml-2 text-emerald-700">Available</span>}
              {slug && available === false && <span className="ml-2 text-red-700">Taken</span>}
              {slug && isReservedSlug(slug) && <span className="ml-2 text-red-700">Reserved</span>}
            </p>
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-[var(--oh-text-secondary)]">Your name</span>
            <input
              required
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              maxLength={120}
              className="h-11 w-full rounded-md border border-[var(--oh-border-strong)] px-3 outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-[var(--oh-text-secondary)]">Username</span>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
              maxLength={120}
              className="h-11 w-full rounded-md border border-[var(--oh-border-strong)] px-3 outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-[var(--oh-text-secondary)]">Email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
              className="h-11 w-full rounded-md border border-[var(--oh-border-strong)] px-3 outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-[var(--oh-text-secondary)]">Password</span>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              className="h-11 w-full rounded-md border border-[var(--oh-border-strong)] px-3 outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20"
              placeholder="At least 12 characters"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-[var(--oh-text-secondary)]">Phone (optional)</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={64}
              className="h-11 w-full rounded-md border border-[var(--oh-border-strong)] px-3 outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20"
            />
          </label>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || available === false}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[var(--oh-primary)] text-base font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-wait disabled:opacity-70"
          >
            {busy ? "Creating store…" : "Create store and enter"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[var(--oh-text-secondary)]">
          Already have a store?{" "}
          <Link href="/login" className="font-semibold text-[var(--oh-primary)] hover:underline">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
