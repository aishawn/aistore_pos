"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { OrithosLogo } from "@/components/OrithosLogo";
import { useAuth } from "@/lib/auth";
import { setUiMode } from "@/lib/ui-mode";
import {
  controlPlaneLandingPath,
  isControlPlaneHost,
  parseTenantSlugFromHost,
  storeLandingPath,
  tenantBaseDomain,
} from "@/lib/tenant-host";

type UiMode = "web" | "mobile";
const REMEMBERED_USERNAME_KEY = "orithos-remembered-username";

function safeReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const parsed = new URL(value, window.location.origin);
    if (
      parsed.origin !== window.location.origin
      || parsed.pathname === "/login"
      || parsed.pathname === "/signup"
      || parsed.pathname === "/forgot-password"
      || parsed.pathname === "/reset-password"
      || parsed.pathname.startsWith("/auth/")
    ) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [controlPlane, setControlPlane] = useState(true);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [rememberUsername, setRememberUsername] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<UiMode | null>(null);
  const [passwordResetNotice, setPasswordResetNotice] = useState(false);

  useEffect(() => {
    const host = window.location.host;
    const slug = parseTenantSlugFromHost(host);
    setTenantSlug(slug);
    setControlPlane(isControlPlaneHost(host));
    try {
      const rememberedUsername = localStorage.getItem(REMEMBERED_USERNAME_KEY);
      if (rememberedUsername) {
        setUsername(rememberedUsername);
        setRememberUsername(true);
      }
      // Legacy key from when the console asked for a subdomain — clear it.
      localStorage.removeItem("orithos-remembered-subdomain");
    } catch {
      // Storage may be unavailable in private browsing; sign-in still works.
    }
    setPasswordResetNotice(new URLSearchParams(window.location.search).get("reset") === "1");
  }, []);

  async function doLogin(mode: UiMode) {
    setBusy(mode);
    setError(null);
    try {
      // Control plane: no subdomain — API uses the platform-operator vendor.
      // Store host: tenant comes from Host; do not send subdomain.
      const res = await login(username.trim(), password, undefined);
      try {
        if (rememberUsername) {
          localStorage.setItem(REMEMBERED_USERNAME_KEY, username.trim());
        } else {
          localStorage.removeItem(REMEMBERED_USERNAME_KEY);
        }
      } catch {
        // Remembering the username is optional and must not block sign-in.
      }
      setUiMode(mode);

      if (res.bootstrapToken && res.redirectHost) {
        const url = new URL("/auth/bootstrap", res.redirectHost.endsWith("/")
          ? res.redirectHost
          : `${res.redirectHost}/`);
        url.searchParams.set("token", res.bootstrapToken);
        window.location.assign(url.toString());
        return;
      }

      const returnPath = safeReturnPath(new URLSearchParams(window.location.search).get("next"));
      if (controlPlane) {
        window.location.assign(controlPlaneLandingPath(returnPath));
        return;
      }
      window.location.assign(storeLandingPath(returnPath, mode));
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn’t sign you in. Check your details and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await doLogin("web");
  }

  // Keep the SSR and browser markup identical across local HTTP and production HTTPS.
  const demoStoreLogin = `//demo.${tenantBaseDomain()}/login`;

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[var(--oh-surface)] px-4 py-8 font-sans text-[var(--oh-text)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(37,99,235,0.08),transparent_45%),radial-gradient(ellipse_at_90%_100%,rgba(37,99,235,0.05),transparent_40%)]"
      />

      <div className="relative z-10 mb-6">
        <OrithosLogo />
      </div>

      <section className="relative z-10 grid w-full max-w-[760px] overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] md:grid-cols-2">
        <form method="post" onSubmit={onSubmit} className="flex flex-col justify-center gap-5 p-6 sm:p-8 lg:p-10" aria-labelledby="login-title">
          <div>
            <h1 id="login-title" className="text-xl font-semibold tracking-tight text-[var(--oh-text)]">Sign in</h1>
            <p className="mt-1 text-sm text-[var(--oh-text-secondary)]">
              {tenantSlug
                ? `Store ${tenantSlug}.${tenantBaseDomain()}`
                : "Orithos platform console"}
            </p>
          </div>

          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-[var(--oh-text-secondary)]">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={120}
              placeholder="Username"
              className="h-11 w-full rounded-md border border-[var(--oh-border-strong)] bg-white px-3 text-base text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[var(--oh-text-secondary)]">Password</label>
            <span className="flex h-11 w-full items-center rounded-md border border-[var(--oh-border-strong)] bg-white pr-1 focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/20">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                maxLength={256}
                placeholder="Password"
                className="h-full min-w-0 flex-1 bg-transparent px-3 text-base text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="grid h-11 w-11 shrink-0 place-items-center rounded text-[var(--oh-placeholder)] hover:text-[var(--oh-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--oh-primary)]"
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="remember-username" className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[var(--oh-text-secondary)]">
              <input
                id="remember-username"
                type="checkbox"
                checked={rememberUsername}
                onChange={(event) => setRememberUsername(event.target.checked)}
                className="h-4 w-4 accent-[var(--oh-primary)]"
              />
              Remember username on this device
            </label>
            <Link href="/forgot-password" className="inline-flex min-h-11 items-center rounded px-1 text-sm font-semibold text-[var(--oh-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
              Forgot password?
            </Link>
          </div>

          {passwordResetNotice && !error && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
              Password updated. Sign in with your new password.
            </p>
          )}

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy !== null}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] text-base font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] disabled:cursor-wait disabled:opacity-70"
          >
            <LogIn size={18} aria-hidden="true" />
            {busy === "web" ? "Signing in…" : "Login"}
          </button>

          {!controlPlane && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void doLogin("mobile")}
              className="min-h-11 rounded-md border border-[var(--oh-border-strong)] bg-transparent text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-70"
            >
              {busy === "mobile" ? "Signing in to mobile workspace…" : "Sign in to mobile workspace"}
            </button>
          )}

          {controlPlane && (
            <p className="text-center text-sm text-[var(--oh-text-secondary)]">
              New store?{" "}
              <Link href="/signup" className="font-semibold text-[var(--oh-primary)] hover:underline">
                Start free trial
              </Link>
              <span className="mt-2 block text-xs">
                Store staff sign in at their shop URL (for example{" "}
                <a
                  href={demoStoreLogin}
                  className="font-semibold text-[var(--oh-primary)] hover:underline"
                >
                  demo.{tenantBaseDomain()}
                </a>
                ). Subdomains are chosen at signup — not on this console login.
              </span>
            </p>
          )}
        </form>

        <aside className="relative hidden min-h-[360px] flex-col justify-end overflow-hidden md:flex">
          {/* eslint-disable-next-line @next/next/no-img-element -- static marketing photo */}
          <img
            src="/images/login-hero.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/35 to-transparent" />
          <div className="relative z-10 space-y-2 p-8 text-white">
            <p className="text-lg font-semibold tracking-tight">
              {controlPlane ? "Manage every Orithos store" : "Sell, stock and store ops"}
            </p>
            <p className="max-w-sm text-sm text-white/85">
              {controlPlane
                ? "Platform console for signup, store list and operator access."
                : "Australian liquor retail workspace."}
            </p>
            {controlPlane && (
              <Link href="/signup" className="inline-flex min-h-10 items-center text-sm font-semibold text-white underline-offset-4 hover:underline">
                Start free trial
              </Link>
            )}
          </div>
        </aside>
      </section>

      <footer className="relative z-10 mt-8 flex w-full max-w-[760px] items-center justify-between px-1 text-xs text-[var(--oh-text-secondary)]">
        <span>© {new Date().getFullYear()} Orithos</span>
        <Link href="https://orithos.com.au" className="hover:text-[var(--oh-primary)]">Orithos home</Link>
      </footer>
    </main>
  );
}
