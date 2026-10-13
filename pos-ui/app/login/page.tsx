"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { OrithosLogo } from "@/components/OrithosLogo";
import { useAuth } from "@/lib/auth";
import { setUiMode } from "@/lib/ui-mode";

type UiMode = "web" | "mobile";
const REMEMBERED_USERNAME_KEY = "orithos-remembered-username";

function safeReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const parsed = new URL(value, window.location.origin);
    if (
      parsed.origin !== window.location.origin
      || parsed.pathname === "/login"
      || parsed.pathname === "/forgot-password"
      || parsed.pathname === "/reset-password"
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
  const [rememberUsername, setRememberUsername] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<UiMode | null>(null);
  const [passwordResetNotice, setPasswordResetNotice] = useState(false);

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
    setPasswordResetNotice(new URLSearchParams(window.location.search).get("reset") === "1");
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
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#1c2228] px-4 py-8 font-sans text-[var(--oh-text)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(94,187,235,0.18),transparent_45%),radial-gradient(ellipse_at_80%_70%,rgba(232,145,104,0.12),transparent_40%),linear-gradient(160deg,#1a1f24_0%,#2a3138_55%,#1c2228_100%)]"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:url('/images/logo-new.png')] [background-position:center] [background-repeat:no-repeat] [background-size:min(70vw,480px)]" />

      <div className="relative z-10 mb-6 scale-110">
        <OrithosLogo inverse />
      </div>

      <section className="relative z-10 grid w-full max-w-[720px] overflow-hidden bg-white shadow-[0_24px_60px_rgba(0,0,0,0.35)] md:grid-cols-2">
        <form onSubmit={onSubmit} className="flex flex-col justify-center gap-5 p-8 sm:p-10" aria-labelledby="login-title">
          <div>
            <h1 id="login-title" className="sr-only">Sign in</h1>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-black/70">Username</label>
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
              placeholder="Username"
              className="h-12 w-full border border-[#bdbdbd] bg-white px-3 text-base text-black outline-none placeholder:text-[#757575] focus:border-[var(--sf-cta)] focus:ring-2 focus:ring-[var(--sf-cta)]/25"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-black/70">Password</label>
            <span className="flex h-12 w-full items-center border border-[#bdbdbd] bg-white pr-1 focus-within:border-[var(--sf-cta)] focus-within:ring-2 focus-within:ring-[var(--sf-cta)]/25">
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
                className="h-full min-w-0 flex-1 bg-transparent px-3 text-base text-black outline-none placeholder:text-[#757575]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="grid h-10 w-10 shrink-0 place-items-center text-[#757575] hover:text-black"
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="remember-username" className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-black/65">
              <input
                id="remember-username"
                type="checkbox"
                checked={rememberUsername}
                onChange={(event) => setRememberUsername(event.target.checked)}
                className="h-4 w-4 accent-[var(--sf-cta)]"
              />
              Remember username on this device
            </label>
            <Link href="/forgot-password" className="text-sm font-semibold text-[var(--sf-cta)] hover:underline">
              Forgot password?
            </Link>
          </div>

          {passwordResetNotice && !error && (
            <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
              Password updated. Sign in with your new password.
            </p>
          )}

          {error && (
            <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy !== null}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[var(--sf-cta)] text-base font-semibold text-white transition-colors hover:bg-[var(--sf-cta-hover)] disabled:cursor-wait disabled:opacity-70"
          >
            <LogIn size={18} aria-hidden="true" />
            {busy === "web" ? "Signing in…" : "Login"}
          </button>

          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void doLogin("mobile")}
            className="min-h-10 border border-[#bdbdbd] bg-transparent text-sm font-semibold text-black transition-colors hover:bg-[var(--sf-pad-bg)] disabled:cursor-wait disabled:opacity-70"
          >
            {busy === "mobile" ? "Opening mobile workspace…" : "Use mobile workspace"}
          </button>
        </form>

        <aside className="relative hidden min-h-[320px] flex-col justify-end bg-[linear-gradient(165deg,#edf6fb_0%,#f7f8fa_45%,#fff1e9_100%)] md:flex">
          <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_70%_30%,rgba(94,187,235,0.45),transparent_50%)]" />
          <div className="relative z-10 bg-[#2a3138]/95 px-5 py-4 text-white">
            <p className="text-sm font-semibold leading-snug">Orithos retail workspace</p>
            <p className="mt-1 text-xs text-white/65">Sell, stock and store ops for Australian liquor retail</p>
            <Link
              href="https://orithos.com.au/apply-for-pilot?request=demo"
              className="mt-2 inline-block text-sm font-semibold text-[var(--sf-cta)] hover:underline"
            >
              More Info…
            </Link>
            <div className="mt-3 h-0.5 w-full bg-[var(--sf-cta)]" />
          </div>
        </aside>
      </section>

      <footer className="relative z-10 mt-6 flex w-full max-w-[720px] flex-wrap items-center justify-between gap-2 text-xs text-white/55">
        <span>© {new Date().getFullYear()} Orithos</span>
        <Link href="https://orithos.com.au" className="hover:text-white">Orithos home</Link>
      </footer>
    </main>
  );
}
