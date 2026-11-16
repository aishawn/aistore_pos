"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OrithosLogo } from "@/components/OrithosLogo";
import { BrandStoreGateway } from "@/components/BrandStoreGateway";
import { useAuth } from "@/lib/auth";
import {
  AccessibleStore,
  fetchAccessibleStores,
  storeLoginUrl,
} from "@/lib/vendor-membership";
import { brandSignupUrl, isControlPlaneHost } from "@/lib/tenant-host";

export default function MyStoresPage() {
  const { ready, user } = useAuth();
  const [stores, setStores] = useState<AccessibleStore[]>([]);
  const [multiVendor, setMultiVendor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setBlocked(!isControlPlaneHost(window.location.host));
  }, []);

  useEffect(() => {
    if (!ready || blocked) return;
    let cancelled = false;
    void fetchAccessibleStores()
      .then((res) => {
        if (cancelled) return;
        setStores(res.stores ?? []);
        setMultiVendor(Boolean(res.multiVendorMembershipEnabled));
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load your stores");
        }
      });
    return () => { cancelled = true; };
  }, [ready, blocked, user?.id]);

  if (blocked) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-[var(--oh-surface)] px-4 text-center">
        <OrithosLogo />
        <p className="mt-6 max-w-md text-sm text-[var(--oh-text-secondary)]">
          Open this page from the Orithos home or app host to manage store access.
        </p>
        <Link href="/login" className="mt-4 text-sm font-semibold text-[var(--oh-primary)] hover:underline">
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[var(--oh-surface)] px-4 py-10 font-sans text-[var(--oh-text)]">
      <div className="mx-auto w-full max-w-lg">
        <OrithosLogo />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Your Orithos stores</h1>
        <p className="mt-2 text-sm text-[var(--oh-muted)]">
          One account is linked to your store subdomain today. Multi-store membership will list every store here when enabled.
        </p>

        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}

        <ul className="mt-6 space-y-3">
          {stores.map((store) => (
            <li key={store.vendorId} className="rounded-xl border border-[var(--oh-border)] bg-white p-4">
              <p className="font-semibold">{store.name}</p>
              <p className="mt-0.5 font-mono text-xs text-[var(--oh-muted)]">{store.slug}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={storeLoginUrl(store.slug)}
                  className="inline-flex min-h-11 items-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white"
                >
                  Open store
                </a>
                <a
                  href={`${storeLoginUrl(store.slug).replace("/login", "")}/settings/registers-outlets`}
                  className="inline-flex min-h-11 items-center rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-primary)]"
                >
                  Outlets
                </a>
              </div>
            </li>
          ))}
          {!stores.length && ready && !error && (
            <li className="rounded-xl border border-dashed border-[var(--oh-border)] p-6 text-sm text-[var(--oh-muted)]">
              Sign in to see stores linked to your account.
            </li>
          )}
        </ul>

        {multiVendor && (
          <p className="mt-4 text-xs text-[var(--oh-muted)]">Multi-vendor membership is active for this account.</p>
        )}

        <motionDiv className="mt-10">
          <BrandStoreGateway />
        </motionDiv>

        <p className="mt-8 text-center text-sm text-[var(--oh-muted)]">
          New business?{" "}
          <Link href={brandSignupUrl()} className="font-semibold text-[var(--oh-primary)] hover:underline">
            Start free trial
          </Link>
        </p>
      </div>
    </main>
  );
}

function motionDiv({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}