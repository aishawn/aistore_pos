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

type OutletDraft = { name: string; registerCount: number };

const STEPS = ["Business", "Store", "Outlets", "Sample data"] as const;

export default function SignupPage() {
  const [step, setStep] = useState(0);
  const [organisationName, setOrganisationName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [outlets, setOutlets] = useState<OutletDraft[]>([{ name: "", registerCount: 1 }]);
  const [dummyData, setDummyData] = useState(true);
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

  useEffect(() => {
    if (!organisationName.trim()) return;
    setOutlets((current) => {
      if (current.length !== 1 || current[0].name.trim()) return current;
      return [{ name: organisationName.trim(), registerCount: current[0].registerCount || 1 }];
    });
  }, [organisationName]);

  function validateStep(index: number): string | null {
    if (index === 0) {
      if (organisationName.trim().length < 2) return "Enter your business or store brand name.";
      return null;
    }
    if (index === 1) {
      if (!slug || isReservedSlug(slug)) return "Choose a valid store subdomain.";
      if (available === false) return "That subdomain is already taken.";
      if (ownerName.trim().length < 1) return "Enter your name.";
      if (username.trim().length < 3) return "Username must be at least 3 characters.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid email.";
      if (password.length < 8) return "Password must be at least 8 characters.";
      if (password !== passwordConfirm) return "Password confirmation does not match.";
      return null;
    }
    if (index === 2) {
      if (!outlets.length) return "Add at least one outlet.";
      if (outlets.length > 5) return "Trial stores support up to 5 outlets.";
      for (const outlet of outlets) {
        if (!outlet.name.trim()) return "Each outlet needs a name.";
        if (!Number.isInteger(outlet.registerCount) || outlet.registerCount < 1 || outlet.registerCount > 10) {
          return "Registers per outlet must be between 1 and 10.";
        }
      }
      return null;
    }
    return null;
  }

  function goNext() {
    setError(null);
    const message = validateStep(step);
    if (message) {
      setError(message);
      return;
    }
    setStep((value) => Math.min(STEPS.length - 1, value + 1));
  }

  function goBack() {
    setError(null);
    setStep((value) => Math.max(0, value - 1));
  }

  async function onSubmit() {
    setError(null);
    for (let i = 0; i < STEPS.length; i++) {
      const message = validateStep(i);
      if (message) {
        setStep(i);
        setError(message);
        return;
      }
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
        outlets: outlets.map((outlet) => ({
          name: outlet.name.trim(),
          registerCount: outlet.registerCount,
        })),
        dummyData,
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
        <div className="mb-5" aria-label="Signup progress">
          <div className="flex gap-1.5">
            {STEPS.map((label, index) => (
              <div
                key={label}
                className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-[var(--oh-primary)]" : "bg-[var(--oh-border)]"}`}
              />
            ))}
          </div>
          <p className="mt-2 text-xs font-medium text-[var(--oh-muted)]">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </p>
        </div>

        <h1 className="text-xl font-semibold tracking-tight">Start your free trial</h1>
        <p className="mt-1 text-sm text-[var(--oh-text-secondary)]">
          {step === 0 && "Tell us the business name customers will recognise."}
          {step === 1 && "Choose your store URL and owner login."}
          {step === 2 && "Configure outlets and how many registers each one needs."}
          {step === 3 && "Optional sample products help you explore Sell immediately."}
        </p>

        <div className="mt-6 flex flex-col gap-4">
          {step === 0 && (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-[var(--oh-text-secondary)]">Business name *</span>
              <input
                required
                value={organisationName}
                onChange={(e) => setOrganisationName(e.target.value)}
                maxLength={120}
                className="h-11 w-full rounded-md border border-[var(--oh-border-strong)] px-3 outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20"
                placeholder="Acme Cellars"
              />
            </label>
          )}

          {step === 1 && (
            <>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-[var(--oh-text-secondary)]">Subdomain *</span>
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
                  Your store opens at <span className="font-medium text-[var(--oh-text)]">{preview}</span>.
                  Letters, numbers and hyphens only.
                  {slug && available === true && <span className="ml-2 text-emerald-700">Available</span>}
                  {slug && available === false && <span className="ml-2 text-red-700">Taken</span>}
                  {slug && isReservedSlug(slug) && <span className="ml-2 text-red-700">Reserved</span>}
                </p>
              </label>

              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-[var(--oh-text-secondary)]">Your name *</span>
                <input
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  maxLength={120}
                  className="h-11 w-full rounded-md border border-[var(--oh-border-strong)] px-3 outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-[var(--oh-text-secondary)]">Username *</span>
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
                <span className="mb-1.5 block font-medium text-[var(--oh-text-secondary)]">Email *</span>
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
                <span className="mb-1.5 block font-medium text-[var(--oh-text-secondary)]">Password *</span>
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  className="h-11 w-full rounded-md border border-[var(--oh-border-strong)] px-3 outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20"
                  placeholder="At least 8 characters"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-[var(--oh-text-secondary)]">Password confirm *</span>
                <input
                  required
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  className="h-11 w-full rounded-md border border-[var(--oh-border-strong)] px-3 outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20"
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
            </>
          )}

          {step === 2 && (
            <div className="space-y-3">
              {outlets.map((outlet, index) => (
                <div key={index} className="rounded-lg border border-[var(--oh-border)] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Outlet {index + 1}</p>
                    {outlets.length > 1 && (
                      <button
                        type="button"
                        className="text-xs font-semibold text-rose-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
                        onClick={() => setOutlets((rows) => rows.filter((_, i) => i !== index))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium text-[var(--oh-text-secondary)]">Outlet name *</span>
                    <input
                      value={outlet.name}
                      onChange={(e) => setOutlets((rows) => rows.map((row, i) => i === index ? { ...row, name: e.target.value } : row))}
                      maxLength={120}
                      className="h-11 w-full rounded-md border border-[var(--oh-border-strong)] px-3 outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20"
                      placeholder={organisationName.trim() || "Main store"}
                    />
                  </label>
                  <label className="mt-3 block text-sm">
                    <span className="mb-1.5 block font-medium text-[var(--oh-text-secondary)]">Registers *</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={outlet.registerCount}
                      onChange={(e) => setOutlets((rows) => rows.map((row, i) => i === index ? { ...row, registerCount: Number(e.target.value) || 1 } : row))}
                      className="h-11 w-full rounded-md border border-[var(--oh-border-strong)] px-3 outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20"
                    />
                  </label>
                </div>
              ))}
              <button
                type="button"
                disabled={outlets.length >= 5}
                onClick={() => setOutlets((rows) => [...rows, { name: "", registerCount: 1 }])}
                className="min-h-10 rounded-md border border-dashed border-[var(--oh-border-strong)] px-3 text-sm font-semibold text-[var(--oh-primary)] hover:bg-[var(--oh-orange-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"
              >
                Add outlet
              </button>
              <p className="text-xs text-[var(--oh-muted)]">
                Each outlet gets its own Odoo POS register on the shared company. Trial limit: 5 outlets.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <label className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${dummyData ? "border-[var(--oh-primary)] bg-[var(--oh-orange-light)]" : "border-[var(--oh-border)]"}`}>
                <input
                  type="radio"
                  name="dummyData"
                  checked={dummyData}
                  onChange={() => setDummyData(true)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold text-[var(--oh-text)]">Include sample data</span>
                  <span className="mt-1 block text-sm text-[var(--oh-text-secondary)]">
                    Adds a DEMO catalogue with categories and stock, a few customers, recent demo sales (and a refund), and leaves one register open so Overview and Sell look lived-in. You can remove it later under Settings → Data before importing your own products.
                  </span>
                </span>
              </label>
              <label className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${!dummyData ? "border-[var(--oh-primary)] bg-[var(--oh-orange-light)]" : "border-[var(--oh-border)]"}`}>
                <input
                  type="radio"
                  name="dummyData"
                  checked={!dummyData}
                  onChange={() => setDummyData(false)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold text-[var(--oh-text)]">Start empty</span>
                  <span className="mt-1 block text-sm text-[var(--oh-text-secondary)]">
                    No sample catalogue. Import or create products before selling.
                  </span>
                </span>
              </label>
              <div className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2.5 text-sm text-[var(--oh-text-secondary)]">
                <p><span className="font-semibold text-[var(--oh-text)]">Store:</span> {preview}</p>
                <p className="mt-1"><span className="font-semibold text-[var(--oh-text)]">Outlets:</span> {outlets.map((o) => `${o.name.trim() || "Untitled"} (${o.registerCount} reg)`).join(", ")}</p>
                <p className="mt-1"><span className="font-semibold text-[var(--oh-text)]">Sample data:</span> {dummyData ? "Yes" : "No"}</p>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={goBack}
                disabled={busy}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-[var(--oh-border-strong)] bg-white text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-70"
              >
                Back
              </button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={busy || (step === 1 && available === false)}
                className="inline-flex min-h-11 flex-[2] items-center justify-center rounded-md bg-[var(--oh-primary)] text-base font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-70"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onSubmit()}
                disabled={busy}
                className="inline-flex min-h-11 flex-[2] items-center justify-center rounded-md bg-[var(--oh-primary)] text-base font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-70"
              >
                {busy ? "Creating store…" : "Create store and enter"}
              </button>
            )}
          </div>
        </div>

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
