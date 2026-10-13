"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, PackageCheck, ShoppingBasket, Sparkles } from "lucide-react";
import { OrithosLogo } from "@/components/OrithosLogo";
import { useAuth } from "@/lib/auth";
import { setUiMode } from "@/lib/ui-mode";

type UiMode = "web" | "mobile";
const REMEMBERED_USERNAME_KEY = "orithos-remembered-username";

function safeReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.origin !== window.location.origin || parsed.pathname === "/login") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

const capabilities = [
  { icon: ShoppingBasket, label: "Point of sale and register operations" },
  { icon: PackageCheck, label: "Products, stock and supplier workflows" },
  { icon: Sparkles, label: "Orithos AI tools for retail teams" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberUsername, setRememberUsername] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<UiMode | null>(null);

  useEffect(() => {
    try {
      const rememberedUsername = localStorage.getItem(REMEMBERED_USERNAME_KEY);
      if (rememberedUsername) {
        setUsername(rememberedUsername);
        setRememberUsername(true);
      }
    } catch {
      // Storage may be unavailable in private browsing; sign-in still works.
    }
  }, []);

  async function doLogin(mode: UiMode) {
    setBusy(mode);
    setError(null);
    try {
      await login(username.trim(), password);
      try {
        if (rememberUsername) localStorage.setItem(REMEMBERED_USERNAME_KEY, username.trim());
        else localStorage.removeItem(REMEMBERED_USERNAME_KEY);
      } catch {
        // Remembering the username is optional and must not block sign-in.
      }
      setUiMode(mode);
      const returnPath = safeReturnPath(new URLSearchParams(window.location.search).get("next"));
      window.location.assign(returnPath ?? (mode === "mobile" ? "/m" : "/"));
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

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[var(--oh-paper)] px-5 py-6 text-[var(--oh-ink)] sm:px-8 sm:py-8">
      <div aria-hidden="true" className="pointer-events-none absolute -right-44 -top-56 h-[570px] w-[570px] rounded-full border border-[var(--oh-orange)]/15 sm:-right-20 sm:-top-64" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-40 h-[410px] w-[410px] rounded-full border border-[var(--oh-orange)]/15 sm:right-0 sm:-top-48" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between">
        <OrithosLogo />
        <Link
          href="https://orithos.com.au"
          className="rounded-md px-3 py-2 text-sm font-semibold text-[var(--oh-ink-soft)] transition-colors hover:text-[var(--oh-orange-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-orange-dark)]"
        >
          Orithos home
        </Link>
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 py-12 md:grid-cols-[minmax(0,1fr)_minmax(360px,470px)] md:gap-16 lg:gap-24">
        <section className="max-w-xl">
          <p className="mb-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-[var(--oh-ink-soft)]">
            <span className="h-2 w-2 rounded-full bg-[var(--oh-orange)] shadow-[0_0_0_4px_rgba(243,146,0,.12)]" />
            Retail workspace
          </p>
          <h1 className="max-w-[620px] text-4xl font-bold leading-[1.08] tracking-[-.055em] text-[var(--oh-ink)] sm:text-5xl lg:text-[58px]">
            Sign in to your store.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-[#55636c] sm:text-lg sm:leading-8">
            Open the workspace your team uses to sell, manage stock and keep store operations moving.
          </p>

          <ul className="mt-9 grid gap-4">
            {capabilities.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm font-medium text-[var(--oh-ink-soft)] sm:text-base">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#edf4f8] text-[#155a86]">
                  <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="login-title" className="w-full rounded-xl border border-[#e1e5e8] bg-white p-6 shadow-[0_18px_50px_rgba(28,40,50,.08)] sm:p-9">
          <div className="mb-7">
            <h2 id="login-title" className="text-2xl font-bold tracking-[-.035em] text-[var(--oh-ink)]">Welcome back</h2>
            <p className="mt-2 text-sm leading-6 text-[#687780]">Sign in with your Orithos account to continue.</p>
          </div>

          <form onSubmit={onSubmit} className="grid gap-5">
            <label htmlFor="username" className="grid gap-2 text-sm font-semibold text-[#34414a]">
              Username
              <input
                id="username"
                name="username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={120}
                className="h-12 w-full rounded-md border border-[#d9dfe4] bg-white px-3 text-base font-normal text-[var(--oh-ink)] outline-none transition-shadow placeholder:text-[#89939b] focus:border-[var(--oh-primary)] focus:ring-3 focus:ring-[#155a8630]"
              />
            </label>

            <label htmlFor="password" className="grid gap-2 text-sm font-semibold text-[#34414a]">
              Password
              <span className="flex h-12 w-full items-center rounded-md border border-[#d9dfe4] bg-white pr-1 transition-shadow focus-within:border-[var(--oh-primary)] focus-within:ring-3 focus-within:ring-[#155a8630]">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  maxLength={256}
                  className="h-full min-w-0 flex-1 rounded-md bg-transparent px-3 text-base font-normal text-[var(--oh-ink)] outline-none placeholder:text-[#89939b]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded text-[#687780] transition-colors hover:bg-[#f3f5f2] hover:text-[var(--oh-ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--oh-orange-dark)]"
                >
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </span>
            </label>

              <label htmlFor="remember-username" className="-mt-2 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-[#52606a]">
              <input
                id="remember-username"
                type="checkbox"
                checked={rememberUsername}
                onChange={(event) => setRememberUsername(event.target.checked)}
                className="h-4 w-4 rounded border-[#aebbb2] accent-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
              />
              Remember username on this device
            </label>

            {error && <p className="rounded-md border border-[#f0c8c2] bg-[#fff4f2] px-3 py-2.5 text-sm leading-5 text-[#9b3328]" role="alert">{error}</p>}

            <button
              type="submit"
              disabled={busy !== null}
              className="mt-1 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-5 font-bold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-70"
            >
              {busy === "web" ? "Signing in…" : "Sign in"}
              {busy === null && <ArrowRight size={18} aria-hidden="true" />}
            </button>

            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void doLogin("mobile")}
              className="min-h-11 rounded-md border border-[#cbd4ce] bg-transparent px-4 text-sm font-semibold text-[var(--oh-ink)] transition-colors hover:border-[#9daaa2] hover:bg-[var(--oh-paper)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-orange-dark)] disabled:cursor-wait disabled:opacity-70"
            >
              {busy === "mobile" ? "Opening mobile workspace…" : "Use mobile workspace"}
            </button>
          </form>

          <div className="mt-6 grid gap-2 border-t border-[#e8ece8] pt-5 text-xs leading-5 text-[#76837b]">
            <p>Access is managed by your store administrator. If you can’t sign in, contact them for help.</p>
            <p>
              Looking for a product tour?{" "}
              <a
                href="https://orithos.com.au/apply-for-pilot?request=demo"
                className="font-semibold text-[#8b4a00] underline decoration-[#d8a14b] underline-offset-2 transition-colors hover:text-[var(--oh-orange-dark)] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-orange-dark)]"
              >
                Request a guided demo
              </a>
              .
            </p>
          </div>
        </section>
      </div>

      <footer className="relative z-10 mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-[#e2e8e4] pt-5 text-xs text-[#76837b]">
        <span>© {new Date().getFullYear()} Orithos</span>
        <span>Retail POS · Australia</span>
      </footer>
    </main>
  );
}
