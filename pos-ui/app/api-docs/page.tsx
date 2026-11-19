import Link from "next/link";
import { ArrowUpRight, BookOpen, Code2, ShieldCheck } from "lucide-react";

const contractLinkClass =
  "inline-flex min-h-10 items-center gap-2 rounded border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-sm font-semibold text-[var(--oh-text)] no-underline hover:border-[var(--oh-primary)] hover:text-[var(--oh-primary)]";

export default function ApiDocsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 text-[var(--oh-text)] sm:px-6 lg:px-8">
      <header className="border-b border-[var(--oh-border)] pb-6">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--oh-primary)]">
          <BookOpen size={16} aria-hidden="true" /> Developer resources
        </div>
        <h1 className="mt-2 text-2xl font-semibold">Orithos API documentation</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--oh-muted)]">
          API references for the Orithos POS application and approved external integrations. These are separate interfaces with different authentication and access rules.
        </p>
      </header>

      <section className="grid gap-6 border-b border-[var(--oh-border)] py-6 md:grid-cols-2" aria-label="API references">
        <article className="flex flex-col items-start gap-3">
          <div className="flex items-center gap-2 font-semibold"><Code2 size={18} className="text-[var(--oh-primary)]" aria-hidden="true" /> Internal POS API</div>
          <p className="text-sm leading-6 text-[var(--oh-muted)]">
            Used by the signed-in Orithos application and controlled services. It uses the existing Orithos JWT and response contract; it is not a partner integration credential.
          </p>
          <a className={contractLinkClass} href="/openapi.json" target="_blank" rel="noreferrer">
            Internal OpenAPI JSON <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </article>

        <article className="flex flex-col items-start gap-3 border-t border-[var(--oh-border)] pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
          <div className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-[var(--oh-primary)]" aria-hidden="true" /> Partner integrations</div>
          <p className="text-sm leading-6 text-[var(--oh-muted)]">
            Partner integrations are provisioned separately from the POS application API. Contact Orithos to confirm availability and receive the current contract, scopes, and onboarding details.
          </p>
          <Link href="https://orithos.com.au/help?topic=integrations" target="_blank" rel="noreferrer" className={contractLinkClass}>
            Partner integration support <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </article>
      </section>

      <section className="max-w-3xl border-b border-[var(--oh-border)] py-6">
        <h2 className="text-lg font-semibold">Legacy API</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">
          The legacy <code className="text-[var(--oh-text)]">/api/pos/v1/*</code> API is retired and returns HTTP 410. Do not use legacy API tokens or endpoints; request the current approved integration contract through Help &amp; Support.
        </p>
      </section>

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-5 text-sm">
        <Link href="https://orithos.com.au/help?topic=integrations" target="_blank" rel="noreferrer" className="font-semibold text-[var(--oh-primary)] hover:underline">
          Help &amp; Support
        </Link>
        <span className="text-[var(--oh-muted)]">Partner access and production availability are subject to Orithos approval.</span>
      </footer>
    </main>
  );
}
