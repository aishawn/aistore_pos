"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { fetchHardwareConnectReleaseMeta, getOrithosHardwareConnectDownloadUrl } from "@/lib/hardware-connect-download";

type Props = {
  compact?: boolean;
};

/** Shopfront-style: download the register agent before or while enabling browser loopback access. */
export function HardwareConnectInstallCard({ compact }: Props) {
  const hcDownloadUrl = typeof window !== "undefined" ? getOrithosHardwareConnectDownloadUrl() : null;
  const [releaseVersion, setReleaseVersion] = useState<string | null>(null);

  useEffect(() => {
    void fetchHardwareConnectReleaseMeta().then((meta) => {
      if (meta?.version) setReleaseVersion(meta.version);
    });
  }, []);

  return (
    <div className={compact ? "text-xs sm:text-sm" : "text-sm leading-6"}>
      <p className="font-semibold text-[var(--oh-text)]">Install Orithos Hardware Connect on this register</p>
      <p className="mt-1 text-[var(--oh-muted)]">
        Download the Windows agent once per PC (tray icon, port <span className="font-mono">9170</span>). You can do this
        while fixing browser access below.
      </p>
      {hcDownloadUrl ? (
        <a
          href={hcDownloadUrl}
          download
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white"
        >
          <ExternalLink size={15} aria-hidden="true" />
          {releaseVersion ? `Download & install (v${releaseVersion})` : "Download & install for Windows"}
        </a>
      ) : null}
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-[var(--oh-text)]">
        <li>
          Unzip and run <span className="font-mono">install.ps1</span> (tray starts, logon autostart).
        </li>
        <li>If Windows Firewall asks, allow on <span className="font-semibold">private</span> networks.</li>
        <li>
          After loopback access is allowed: <span className="font-semibold">Connect local bridge</span> and pick your
          receipt printer.
        </li>
      </ol>
    </div>
  );
}