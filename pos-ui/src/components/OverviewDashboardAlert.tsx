"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export type OverviewDashboardAlertProps = {
  title: string;
  detail: string;
  staleNote?: boolean;
  loading?: boolean;
  authExpired?: boolean;
  connection?: boolean;
  integrationsHref?: string;
  returnPath: string;
  onRetry: () => void;
};

/** Compact dashboard refresh alert — lives in the overview header toolbar, not the page body. */
export function OverviewDashboardAlert({
  title,
  detail,
  staleNote,
  loading,
  authExpired,
  connection,
  integrationsHref,
  returnPath,
  onRetry,
}: OverviewDashboardAlertProps) {
  return (
    <div
      className="ov-error ov-dashboard-alert"
      role="alert"
      aria-live="polite"
    >
      <span className="ov-dashboard-alert-icon" aria-hidden="true">
        <AlertTriangle size={17} strokeWidth={1.8} />
      </span>
      <div className="ov-dashboard-alert-copy">
        <h2 className="ov-dashboard-alert-title">{title}</h2>
        <p className="ov-dashboard-alert-detail">
          {detail}
          {staleNote ? " Showing your last loaded summary." : ""}
        </p>
      </div>
      <div className="ov-dashboard-alert-actions">
        <button type="button" onClick={onRetry} disabled={loading} className="ov-dashboard-alert-retry">
          <RefreshCw size={15} aria-hidden="true" />
          <span>Retry</span>
        </button>
        {authExpired ? (
          <Link href={`/login?next=${encodeURIComponent(returnPath)}`}>Sign in</Link>
        ) : connection && integrationsHref ? (
          <Link href={integrationsHref}>Connect</Link>
        ) : null}
      </div>
    </div>
  );
}