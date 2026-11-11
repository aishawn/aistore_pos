import Link from "next/link";
import { BookOpen, CircleAlert } from "lucide-react";

export default function ApiDocsPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 text-[var(--oh-text)] sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-[var(--oh-border)] pb-5">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--oh-primary)]"><BookOpen size={16} /> Developer resources</div>
          <h1 className="mt-2 text-2xl font-semibold">Orithos POS API</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--oh-muted)]">The former external POS integration API has been retired.</p>
        </div>
      </header>

      <section className="mt-6 max-w-3xl rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950" role="status">
        <div className="flex items-start gap-3">
          <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">API retired</h2>
            <p className="mt-2 text-sm leading-6">Requests to <code>/api/pos/v1/*</code> return HTTP 410 Gone. The retired legacy contract, API tokens, batch writes, and webhooks are no longer available.</p>
            <p className="mt-2 text-sm leading-6">The Orithos application uses authenticated, tenant-scoped Orithos APIs for its store workflows. Use the application pages for products, sales, inventory, purchases, customers, and reporting.</p>
            <Link href="/" className="mt-4 inline-flex min-h-10 items-center rounded border border-amber-500 bg-white px-3 text-sm font-semibold hover:bg-amber-100">Open Orithos</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
