"use client";

import { useState } from "react";
import Image from "next/image";
import { OrithosWordmark } from "@/components/OrithosLogo";
import { EyeOffIcon, MonitorIcon, NewspaperIcon, SmartphoneIcon } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { setUiMode } from "@/lib/ui-mode";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"web" | "mobile" | null>(null);

  async function doLogin(mode: "web" | "mobile") {
    setBusy(mode);
    setError(null);
    try {
      await login(username, password);
      setUiMode(mode);
      window.location.assign(mode === "mobile" ? "/m" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doLogin("web");
  }

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-cover bg-center px-4 py-6 font-sans sm:gap-6 sm:py-8"
      style={{ backgroundImage: "url('/images/login-background.jpg')" }}
    >
      <div className="flex items-center gap-3">
        <Image
          src="/images/logo-new.png"
          alt="Orithos"
          width={83}
          height={56}
          className="h-10 w-auto sm:h-14"
          priority
        />
        <h1 className="text-[24px] sm:text-[32px]">
          <OrithosWordmark />
        </h1>
      </div>
      <p className="text-[13px] text-black sm:text-[14px]">Smart Point of Sale</p>

      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-[860px] flex-col overflow-hidden rounded-[var(--oh-radius)] shadow-2xl md:flex-row"
      >
        <div className="flex w-full flex-col bg-white md:w-1/2">
          <div className="flex flex-1 flex-col gap-4 p-5 sm:p-8">
            <h2 className="text-[20px] font-semibold text-[var(--oh-text)]">Sign in</h2>
            <label className="flex flex-col">
              <span className="mb-1 text-[13px] font-medium text-[var(--oh-text-secondary)]">Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                className="h-11 rounded-lg border border-[var(--oh-border)] px-3 text-[15px] outline-none focus:border-[var(--oh-orange)]"
              />
            </label>
            <label className="flex flex-col">
              <span className="mb-1 text-[13px] font-medium text-[var(--oh-text-secondary)]">Password</span>
              <div className="flex h-11 items-center rounded-lg border border-[var(--oh-border)] px-3 focus-within:border-[var(--oh-orange)]">
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="flex-1 text-[15px] outline-none placeholder:text-[var(--oh-placeholder)]"
                />
                <EyeOffIcon size={18} className="text-[var(--oh-muted)]" />
              </div>
            </label>
            {error && <p className="text-[13px] text-[var(--oh-danger)]">{error}</p>}
          </div>
        </div>

        <div className="flex w-full flex-col items-center justify-center gap-5 bg-[var(--oh-surface)] p-5 text-center sm:p-8 md:w-1/2 md:p-10">
          <div className="flex w-full flex-col items-center justify-center gap-5 sm:flex-row sm:gap-8">
            <div className="flex w-full max-w-[220px] flex-col gap-3">
              <button
                type="submit"
                disabled={busy !== null}
                className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--oh-orange)] px-4 text-[16px] font-semibold text-white transition-colors hover:bg-[var(--oh-orange-hover)] disabled:opacity-70"
              >
                <MonitorIcon size={20} />
                {busy === "web" ? "Signing in…" : "WEB"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void doLogin("mobile")}
                className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--oh-border-strong)] bg-white px-4 text-[16px] font-semibold text-[var(--oh-text)] transition-colors hover:bg-white/80 disabled:opacity-70"
              >
                <SmartphoneIcon size={20} />
                {busy === "mobile" ? "Signing in…" : "MOBILE"}
              </button>
            </div>
            <NewspaperIcon size={48} strokeWidth={1.5} className="hidden shrink-0 text-[var(--oh-muted)] sm:block" />
          </div>
          <p className="text-[14px] text-[var(--oh-muted)] sm:text-[15px]">
            We have no news to show you at this time.
          </p>
        </div>
      </form>
    </div>
  );
}
