"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { EyeOffIcon, LogInIcon, NewspaperIcon } from "@/components/icons";
import { useAuth } from "@/lib/auth";

/**
 * Orithos login screen — full-bleed vineyard background, centered logo, and a
 * split card (white sign-in form on the left, dark "news" panel on the right).
 * Submits to the backend (POST /api/auth/login) and stores the JWT.
 */
export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-8 bg-cover bg-center px-4 font-sans"
      style={{ backgroundImage: "url('/images/login-background.jpg')" }}
    >
      <Image
        src="/images/logo-new.png"
        alt="Orithos"
        width={318}
        height={207}
        className="h-auto w-[200px] drop-shadow-lg"
        priority
      />

      <form onSubmit={onSubmit} className="flex w-full max-w-[1000px] overflow-hidden shadow-2xl">
        {/* Left: sign-in form */}
        <div className="flex w-1/2 flex-col bg-white">
          <div className="flex flex-1 flex-col gap-5 p-8">
            <label className="flex flex-col">
              <span className="mb-1 text-[15px] text-neutral-700">Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                className="h-[58px] rounded border-2 border-black px-4 text-[18px] outline-none"
              />
            </label>
            <div className="flex h-[58px] items-center rounded border border-neutral-300 px-4">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 text-[18px] outline-none placeholder:text-neutral-500"
              />
              <EyeOffIcon size={22} className="text-neutral-500" />
            </div>
            {error && <p className="text-[15px] text-[#e2231a]">{error}</p>}
          </div>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-3 bg-[var(--sf-link-blue)] py-3 text-[32px] text-[var(--sf-on-dark)] disabled:opacity-70"
          >
            <LogInIcon size={30} /> {busy ? "…" : "Login"}
          </button>
        </div>

        {/* Right: news panel */}
        <div className="flex w-1/2 flex-col items-center justify-center bg-[#2c2f34] p-10 text-center">
          <NewspaperIcon size={56} strokeWidth={1.5} className="text-neutral-400" />
          <p className="mt-4 text-[18px] text-neutral-400">We have no news to show you at this time.</p>
        </div>
      </form>
    </div>
  );
}
