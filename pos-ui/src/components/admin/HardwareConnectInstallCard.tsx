"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  fetchHardwareConnectReleaseMeta,
  getOrithosHardwareConnectDownloadUrl,
  probeHardwareConnectDownloadAvailable,
} from "@/lib/hardware-connect-download";

type Props = {
  compact?: boolean;
};

/** Shopfront-style: download the register agent before or while enabling browser loopback access. */
export function HardwareConnectInstallCard({ compact }: Props) {
  const hcDownloadUrl = typeof window !== "undefined" ? getOrithosHardwareConnectDownloadUrl() : null;
  const [releaseVersion, setReleaseVersion] = useState<string | null>(null);
  const [downloadReady, setDownloadReady] = useState<boolean | null>(null);

  useEffect(() => {
    void fetchHardwareConnectReleaseMeta().then((meta) => {
      if (meta?.version) setReleaseVersion(meta.version);
    });
  }, []);

  useEffect(() => {
    if (!hcDownloadUrl) return;
    void probeHardwareConnectDownloadAvailable(hcDownloadUrl).then(setDownloadReady);
  }, [hcDownloadUrl]);

  if (compact) {
    return (
      <div className="text-sm">
        <p className="font-semibold text-[var(--oh-text)]">Register agent</p>
        <p className="mt-1 text-xs leading-5 text-[var(--oh-muted)]">Install once per PC (tray, port 9170).</p>
        {hcDownloadUrl && downloadReady === true ? (
          <a
            href={hcDownloadUrl}
            download="OrithosHardwareConnect-win-x64.zip"
            className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white sm:w-auto"
          >
            <ExternalLink size={15} aria-hidden="true" />
            {releaseVersion ? `Download (v${releaseVersion})` : "Download for Windows"}
          </a>
        ) : null}
        {downloadReady === false ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
            Installer not on this server yet. On the register PC use the zip from{" "}
            <span className="font-mono">tools\orithos-hardware-connect\stage-ui-download.ps1</span>, or ask an admin to
            publish the bundle and redeploy.
          </p>
        ) : null}
        <p className="mt-2 text-xs leading-5 text-[var(--oh-muted)]">
          Unzip, run <span className="font-mono text-[var(--oh-text)]">install.ps1</span>, allow private firewall if asked.
        </p>
      </div>
    );
  }

  return (
    <div className="text-sm leading-6">
      <p className="font-semibold text-[var(--oh-text)]">Install Orithos Hardware Connect on this register</p>
      <p className="mt-1 text-[var(--oh-muted)]">
        Download the Windows agent once per PC (tray icon, port <span className="font-mono">9170</span>). You can do this
        while fixing browser access below.
      </p>
      {hcDownloadUrl && downloadReady === true ? (
        <a
          href={hcDownloadUrl}
          download="OrithosHardwareConnect-win-x64.zip"
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white"
        >
          <ExternalLink size={15} aria-hidden="true" />
          {releaseVersion ? `Download & install (v${releaseVersion})` : "Download & install for Windows"}
        </a>
      ) : null}
      {downloadReady === false ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950">
          Installer is not hosted on this site yet. Run{" "}
          <span className="font-mono text-xs">tools\orithos-hardware-connect\stage-ui-download.ps1</span> on a dev machine
          and copy the zip to this register, or set{" "}
          <span className="font-mono text-xs">ORITHOS_HC_DOWNLOAD_URL</span> on the server.
        </p>
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