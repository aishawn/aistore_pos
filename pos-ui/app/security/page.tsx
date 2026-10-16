import Link from "next/link";
import { Info, ArrowRight, ShieldCheck } from "lucide-react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";

const links = [
  { href: "/settings/users", label: "Manage users" },
  { href: "/settings/roles", label: "Manage roles" },
  { href: "/settings/integrations", label: "Review integrations" },
];

export default function SecurityCentrePage() {
  return (
    <AdminPageLayout title="Security Centre" subtitle="Monitor login events and security patterns">
      <section role="status" className="rounded-lg border border-sky-200 bg-sky-50 p-5 text-sky-950">
        <div className="flex items-start gap-3">
          <Info size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Security event monitoring is not connected</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6">
              This pilot does not currently load login events or pattern analysis from a security provider. Event counts, charts, and date filters will appear here once that connection is available.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-[var(--oh-border)] bg-white p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[var(--oh-orange)]" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-[var(--oh-text)]">Available security controls</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--oh-text-secondary)]">
              Use the connected account and setup areas to review access configuration while monitoring is being integrated.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-border-strong)] bg-white px-3 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)]">
                  {link.label}
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </AdminPageLayout>
  );
}
