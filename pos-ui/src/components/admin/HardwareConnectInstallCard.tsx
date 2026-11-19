"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  fetchHardwareConnectReleaseMeta,
  getOrithosHardwareConnectDownloadUrl,
  getOrithosHardwareConnectOneClickUrl,
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
        Open your <span className="font-medium">Downloads</span> folder and double‑click the installer.
      </li>
      <li>
        If Windows asks whether to run the file, choose <span className="font-medium">Run</span>. On SmartScreen, choose{" "}
        <span className="font-medium">More info</span> → <span className="font-medium">Run anyway</span>.
      </li>
      <li>
        Click <span className="font-medium">Yes</span> in the installer window. A tray icon near the clock means it is
        running (allow <span className="font-medium">private</span> firewall if asked).
      </li>
    </ol>
  );
}

/** Shopfront-style: download the register agent before or while enabling browser loopback access. */
export function HardwareConnectInstallCard({ compact }: Props) {
  const probeUrl = typeof window !== "undefined" ? getOrithosHardwareConnectDownloadUrl() : null;
  const oneClickUrl = typeof window !== "undefined" ? getOrithosHardwareConnectOneClickUrl() : null;
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

  const primaryLabel = releaseVersion ? `Install on this PC (v${releaseVersion})` : "Install on this PC";
  const buttonClass = compact
    ? "mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white sm:w-auto"
    : "mt-3 inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white";
  const secondaryClass = compact
    ? "mt-2 inline-flex text-xs font-medium text-[var(--oh-primary)] underline-offset-2 hover:underline"
    : "mt-2 inline-flex text-sm font-medium text-[var(--oh-primary)] underline-offset-2 hover:underline";

  const body = (
    <>
      {downloadHref ? (
        <a
          href={downloadHref}
          download="OrithosHardwareConnect-Setup.exe"
          className={buttonClass}
          rel={hostedOnSite === false ? "noopener noreferrer" : undefined}
          target={hostedOnSite === false ? "_blank" : undefined}
        >
          <Download size={15} aria-hidden="true" />
          {primaryLabel}
        </a>
      ) : (
        <p className={`mt-3 ${compact ? "text-xs" : "text-sm"} text-[var(--oh-muted)]`}>Preparing installer…</p>
      )}
      {oneClickUrl ? (
        <a href={oneClickUrl} download="Install-Orithos-Hardware-Connect.cmd" className={secondaryClass}>
          Guided install for this store (automatic download)
        </a>
      ) : null}
      {hostedOnSite === false ? (
        <p className={`mt-2 ${compact ? "text-xs" : "text-sm"} leading-5 text-[var(--oh-muted)]`}>
          One‑time download (~75&nbsp;MB). No PowerShell or zip required.
        </p>
      ) : null}
      <InstallSteps compact={compact} />
    </>
  );

  if (compact) {
    return (
      <div className="text-sm">
        <p className="text-xs leading-5 text-[var(--oh-muted)]">
          Install once on this PC so printers and EFTPOS can talk to the browser (tray icon, port{" "}
          <span className="font-mono">9170</span>).
        </p>
        {body}
      </div>
    );
  }

  return (
    <div className="text-sm leading-6">
      <p className="font-semibold text-[var(--oh-text)]">Install Orithos Hardware Connect on this register</p>
      <p className="mt-1 text-[var(--oh-muted)]">
        One download, double‑click to install. You can do this while you fix browser access above.
      </p>
      {body}
      <p className="mt-3 text-sm text-[var(--oh-muted)]">
        After browser access is allowed, use <span className="font-medium text-[var(--oh-text)]">Connect local bridge</span>{" "}
        and choose your receipt printer.
      </p>
    </div>
  );
}