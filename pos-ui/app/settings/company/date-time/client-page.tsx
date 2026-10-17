"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, Globe2, ShieldAlert } from "lucide-react";
import { CompanySettingsScaffold } from "@/components/admin/CompanySettingsScaffold";
import { getOdooPosBootstrap } from "@/lib/odoo-api";

const HREF = "/settings/company/date-time";

function timeBehaviors(timezone: string) {
  return [
    { title: "Store business timezone", value: timezone, description: "Sales, receipts and operational dates use the active Odoo POS register timezone.", icon: Globe2 },
    { title: "Date and time display", value: "Australian locale", description: "Receipts and reporting use the en-AU locale with the active Odoo store timezone. This page does not override each screen’s display format.", icon: Clock3 },
    { title: "Start of the week", value: "Not configurable here", description: "The previous Monday selection was an example, not a saved company preference. Weekly reports use their defined date ranges.", icon: CalendarDays },
  ];
}

export default function DateTimeSettingsClient() {
  const [timezone, setTimezone] = useState("Odoo POS configuration");

  useEffect(() => {
    let active = true;
    void getOdooPosBootstrap()
      .then((bootstrap) => {
        if (!active) return;
        const config = bootstrap.configs.find((item) => item.session) ?? bootstrap.configs[0];
        if (config?.timezone) setTimezone(config.timezone);
      })
      .catch(() => {
        // Keep the honest source label when Odoo is disconnected.
      });
    return () => { active = false; };
  }, []);

  return (
    <CompanySettingsScaffold subSectionTitle="Date & Time" activeHref={HREF} showSearch={false} showSave={false}>
      <div className="mx-auto w-full max-w-5xl">
        <section role="status" className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 ring-1 ring-sky-200"><ShieldAlert size={18} aria-hidden="true" /></span>
          <div><h2 className="text-sm font-semibold text-sky-950">Date and time preferences are not edited here</h2><p className="mt-1 text-sm leading-5 text-sky-900/80">The previous selectors were static examples. Store dates use the timezone and locale shown below.</p></div>
        </section>

        <section aria-labelledby="time-behavior-heading" className="mt-6">
          <div className="mb-3"><h2 id="time-behavior-heading" className="text-sm font-semibold text-[var(--oh-text)]">Current date and time behaviour</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Operational timekeeping is consistent across sales and reporting</p></div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {timeBehaviors(timezone).map(({ title, value, description, icon: Icon }) => (
              <li key={title} className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]"><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></span>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h3><span className="inline-flex shrink-0 items-center rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">{value}</span></div><p className="mt-2 text-sm leading-5 text-[var(--oh-muted)]">{description}</p></div>
              </li>
            ))}
          </ul>
          <Link href="/reports/dashboard" className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-semibold text-[var(--oh-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">View reporting periods <ArrowRight size={15} aria-hidden="true" /></Link>
        </section>
      </div>
    </CompanySettingsScaffold>
  );
}
