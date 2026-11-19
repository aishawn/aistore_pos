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
          <div className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-[var(--oh-primary)]" aria-hidden="true" /> Partner API v1</div>
          <p className="text-sm leading-6 text-[var(--oh-muted)]">
            A separately authorized integration API. OAuth2 client credentials and assigned scopes apply to one configured merchant and outlet; callers cannot select a different tenant or outlet in requests.
          </p>
          <a className={contractLinkClass} href="/integrations-openapi.json" target="_blank" rel="noreferrer">
            Partner OpenAPI JSON <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </article>
      </section>

      <section className="max-w-3xl border-b border-[var(--oh-border)] py-6">
        <h2 className="text-lg font-semibold">Partner access</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--oh-muted)]">
          <li>Contact Orithos to request an integration and describe the merchant, outlet, and data flows required.</li>
          <li>After approval, Orithos provisions a client and grants only the required scopes. Keep the client secret on a trusted server and never expose it in a browser or public repository.</li>
          <li>Request a bearer token from <code className="text-[var(--oh-text)]">POST /api/integrations/v1/oauth2/token</code> using HTTP Basic client authentication and <code className="text-[var(--oh-text)]">grant_type=client_credentials</code>.</li>
          <li>Send the token as <code className="text-[var(--oh-text)]">Authorization: Bearer …</code>. Use the OpenAPI contract for available scopes, fields, and endpoint details.</li>
        </ol>
      </section>

      <section className="max-w-3xl border-b border-[var(--oh-border)] py-6">
        <h2 className="text-lg font-semibold">Available partner operations</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">
          The current contract covers products, prices, inventory, and the authorized outlet, plus externally settled sale and refund registration and inventory adjustments. Write requests require an <code className="text-[var(--oh-text)]">Idempotency-Key</code> so safe retries can be detected.
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">
          Sale and refund endpoints record transactions already settled by the partner. They do not authorize EFTPOS payments or replace Orithos checkout. The legacy <code className="text-[var(--oh-text)]">/api/pos/v1/*</code> API remains retired and returns HTTP 410.
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
