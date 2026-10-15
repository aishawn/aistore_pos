"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OrithosLogo } from "@/components/OrithosLogo";
import { api, apiFailureMessage } from "@/lib/api";

interface BootstrapResponse {
  user: {
    id: string | number;
    name: string;
    username: string;
    isAdmin: boolean;
    outletId?: number;
    vendorId?: number;
    email?: string | null;
    pendingPasswordReset?: boolean;
  };
}

const USER_KEY = "sf_user";

export default function BootstrapPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setError("Missing bootstrap token.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.post<BootstrapResponse>("/api/auth/bootstrap", { token });
        if (cancelled) return;
        const user = { ...res.user, id: String(res.user.id) };
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        window.location.replace("/");
      } catch (err) {
        if (!cancelled) {
          setError(apiFailureMessage(err, "Could not open your store session.", "Session expired"));
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[var(--oh-surface)] px-4 text-center">
      <OrithosLogo />
      {!error ? (
        <p className="mt-6 text-sm text-[var(--oh-text-secondary)]">Opening your store…</p>
      ) : (
        <>
          <p className="mt-6 max-w-md text-sm text-red-700" role="alert">{error}</p>
          <Link href="/login" className="mt-4 text-sm font-semibold text-[var(--oh-primary)] hover:underline">
            Go to sign in
          </Link>
        </>
      )}
    </main>
  );
}
