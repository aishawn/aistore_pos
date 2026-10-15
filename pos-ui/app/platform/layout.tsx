"use client";

import { PlatformShell } from "@/components/platform/PlatformShell";
import { isControlPlaneHost } from "@/lib/tenant-host";
import { OrithosLogo } from "@/components/OrithosLogo";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const [controlPlane, setControlPlane] = useState<boolean | null>(null);

  useEffect(() => {
    setControlPlane(isControlPlaneHost(window.location.host));
  }, []);

  if (controlPlane === null) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-[var(--oh-text-secondary)]">
        Loading…
      </div>
    );
  }

  if (!controlPlane) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-4 py-10">
        <OrithosLogo />
        <h1 className="text-xl font-semibold text-[var(--oh-text)]">Platform admin</h1>
        <p className="text-sm text-[var(--oh-text-secondary)]">
          The console is only available on the control plane host (for example{" "}
          <code className="rounded bg-[var(--oh-surface)] px-1">app.orithos.com.au</code>).
        </p>
        <Link href="/login" className="text-sm font-semibold text-[var(--oh-primary)] hover:underline">
          Back to sign in
        </Link>
      </main>
    );
  }

  return <PlatformShell>{children}</PlatformShell>;
}
