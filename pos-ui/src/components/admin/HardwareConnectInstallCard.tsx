"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  fetchHardwareConnectReleaseMeta,
  getOrithosHardwareConnectDownloadUrl,
  probeHardwareConnectDownloadAvailable,
  resolveHardwareConnectDownloadHref,
} from "@/lib/hardware-connect-download";

type Props = {
  compact?: boolean;
};

function InstallSteps({ compact }: { compact?: boolean }) {
  const stepClass = compact ? "text-xs leading-5" : "text-sm leading-6";
  return (
    <ol className={`mt-3 list-decimal space-y-1.5 pl-4 text-[var(--oh-text)] ${stepClass}`}>
      <li>
        Download <span className="font-medium">Orithos Hardware Connect</span> for Windows.
      </li>
      <li>
        Unzip the folder, right‑click <span className="font-mono text-[var(--oh-text)]">install.ps1</span> →{" "}
        <span className="font-medium">Run with PowerShell</span>.
      </li>
      <li>
        If Windows asks about firewall, choose <span className="font-medium">private</span> networks. A tray icon means it
        is running.
      </li>
    </ol>
  );
}

/** Shopfront-style: download the register agent before or while enabling browser loopback access. */
export function HardwareConnectInstallCard({ compact }: Props) {
  const probeUrl = typeof window !== "undefined" ? getOrithosHardwareConnectDownloadUrl() : null;
  const [releaseVersion, setReleaseVersion] = useState<string | null>(null);
  const [downloadHref, setDownloadHref] = useState<string | null>(null);
  const [hostedOnSite, setHostedOnSite] = useState<boolean | null>(null);

  useEffect(() => {
    void fetchHardwareConnectReleaseMeta().then((meta) => {
      if (meta?.version) setReleaseVersion(meta.version);
    });
  }, []);

  useEffect(() => {
    void resolveHardwareConnectDownloadHref().then(setDownloadHref);
    if (!probeUrl) return;
    void probeHardwareConnectDownloadAvailable(probeUrl).then(setHostedOnSite);
  }, [probeUrl]);

  const downloadLabel = releaseVersion ? `Download for Windows (v${releaseVersion})` : "Download for Windows";
  const buttonClass = compact
    ? "mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white sm:w-auto"
    : "mt-3 inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white";

  if (compact) {
    return (
      <div className="text-sm">
        <p className="text-xs leading-5 text-[var(--oh-muted)]">
          Install once on this PC so printers and EFTPOS can talk to the browser (tray icon, port{" "}
          <span className="font-mono">9170</span>).
        </p>
        {downloadHref ? (
          <a
            href={downloadHref}
            download="OrithosHardwareConnect-win-x64.zip"
            className={buttonClass}
            rel={hostedOnSite === false ? "noopener noreferrer" : undefined}
            target={hostedOnSite === false ? "_blank" : undefined}
          >
            <Download size={15} aria-hidden="true" />
            {downloadLabel}
          </a>
        ) : (
          <p className="mt-3 text-xs text-[var(--oh-muted)]">Preparing download…</p>
        )}
        {hostedOnSite === false ? (
          <p className="mt-2 text-xs leading-5 text-[var(--oh-muted)]">
            Opens the official Orithos installer (one‑time download, ~75&nbsp;MB).
          </p>
        ) : null}
        <InstallSteps compact />
      </div>
    );
  }

  return (
    <div className="text-sm leading-6">
      <p className="font-semibold text-[var(--oh-text)]">Install Orithos Hardware Connect on this register</p>
      <p className="mt-1 text-[var(--oh-muted)]">
        Download the Windows agent once per PC. You can install it while you fix browser access above.
      </p>
      {downloadHref ? (
        <a
          href={downloadHref}
          download="OrithosHardwareConnect-win-x64.zip"
          className={buttonClass}
          rel={hostedOnSite === false ? "noopener noreferrer" : undefined}
          target={hostedOnSite === false ? "_blank" : undefined}
        >
          <Download size={15} aria-hidden="true" />
          {downloadLabel}
        </a>
      ) : (
        <p className="mt-3 text-sm text-[var(--oh-muted)]">Preparing download…</p>
      )}
      {hostedOnSite === false ? (
        <p className="mt-2 text-sm text-[var(--oh-muted)]">
          Your store is not hosting the installer file yet; this button opens the official Orithos download.
        </p>
      ) : null}
      <InstallSteps />
      <p className="mt-3 text-sm text-[var(--oh-muted)]">
        After browser access is allowed, use <span className="font-medium text-[var(--oh-text)]">Connect local bridge</span>{" "}
        and choose your receipt printer.
      </p>
    </div>
  );
}