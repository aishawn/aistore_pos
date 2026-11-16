"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  brandSignupUrl,
  isReservedSlug,
  normalizeSlug,
  storeOrigin,
  tenantBaseDomain,
} from "@/lib/tenant-host";

/** Marketing / control-plane CTAs — trial signup and open an existing store subdomain. */
export function BrandStoreGateway({ className = "" }: { className?: string }) {
  const [subdomain, setSubdomain] = useState("");
  const slug = useMemo(() => normalizeSlug(subdomain), [subdomain]);
  const base = tenantBaseDomain();
  const storeHref = slug && !isReservedSlug(slug) ? `${storeOrigin(slug)}/login` : null;

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <InternalSignupLink />
      <motionDivider />
      <div>
        <p className="text-sm font-medium text-[var(--oh-text)]">Already have a store?</p>
        <p className="mt-1 text-sm text-[var(--oh-muted)]">
          Enter your subdomain to sign in on <span className="font-mono text-xs">{`{store}.${base}`}</span>
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <div className="flex min-h-11 flex-1 items-center gap-1 rounded-lg border border-[var(--oh-border)] bg-white px-3">
            <input
              type="text"
              aria-label="Store subdomain"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder="your-store"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              autoComplete="off"
            />
            <span className="shrink-0 text-xs text-[var(--oh-muted)]">.{base}</span>
          </div>
          {storeHref ? (
            <a
              href={storeHref}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--oh-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]"
            >
              Open store
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--oh-border)] px-5 text-sm font-semibold text-[var(--oh-muted)]"
            >
              Open store
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function InternalSignupLink() {
  return (
    <motionRow
      title="Start a free trial"
      description="Create your store, outlets, and registers in one guided flow."
      href={brandSignupUrl()}
      label="Sign up"
    />
  );
}

function motionRow({
  title,
  description,
  href,
  label,
}: {
  title: string;
  description: string;
  href: string;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--oh-border)] bg-white p-4">
      <div>
        <p className="font-semibold text-[var(--oh-text)]">{title}</p>
        <p className="mt-0.5 text-sm text-[var(--oh-muted)]">{description}</p>
      </div>
      <Link
        href={href}
        className="inline-flex min-h-11 items-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]"
      >
        {label}
      </Link>
    </div>
  );
}

function motionDivider() {
  return <div className="h-px bg-[var(--oh-border)]" aria-hidden />;
}