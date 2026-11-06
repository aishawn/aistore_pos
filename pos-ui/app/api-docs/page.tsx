"use client";

import { useMemo, useState } from "react";
import { BookOpen, Check, Copy, ExternalLink, KeyRound, Search, Shield, Terminal } from "lucide-react";

const resources = [
  { name: "Products", path: "products", read: true, write: "Read only" },
  { name: "Sales", path: "sales", read: true, write: "Feature gated" },
  { name: "Refunds", path: "sales:batch", read: false, write: "Full-sale refund supported" },
  { name: "Inventory", path: "inventory", read: true, write: "Count adjustment" },
  { name: "Purchases", path: "purchases", read: true, write: "Draft purchase orders" },
  { name: "Customers", path: "customers", read: true, write: "Read only" },
  { name: "Suppliers", path: "suppliers", read: true, write: "Read only" },
  { name: "Orders", path: "orders", read: true, write: "Read only" },
];

export default function ApiDocsPage() {
  const [query, setQuery] = useState("");
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "https://your-store.orithos.com.au" : window.location.origin;
  const filtered = useMemo(() => resources.filter((item) => `${item.name} ${item.path}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const example = [
    `curl "${origin}/api/pos/v1/products?limit=50"`,
    `-H "Authorization: Bearer ${token || "<API_TOKEN>"}"`,
    `-H "Accept: application/json"`,
  ].join(" \\\n  ");
  async function copyExample() {
    await navigator.clipboard.writeText(example);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 text-[var(--oh-text)] sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-[var(--oh-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--oh-primary)]"><BookOpen size={16} /> Developer resources</div>
          <h1 className="mt-2 text-2xl font-semibold">Orithos POS API</h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--oh-muted)]">Versioned REST API for store integrations. Odoo remains the source of truth, with each request scoped to its store.</p>
        </div>
        <a href="/openapi.yaml" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-medium hover:bg-[var(--oh-surface-muted)]" download><ExternalLink size={15} /> OpenAPI spec</a>
      </header>

      <div className="grid gap-8 py-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="API documentation" className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {["Overview", "Authentication", "Resources", "Batch operations", "Webhooks", "Errors"].map((item, i) => <a key={item} href={`#${item.toLowerCase().replaceAll(" ", "-")}`} className={`shrink-0 rounded-md px-3 py-2 text-sm ${i === 0 ? "bg-[var(--oh-surface-muted)] font-semibold" : "text-[var(--oh-muted)] hover:bg-[var(--oh-surface-muted)] hover:text-[var(--oh-text)]"}`}>{item}</a>)}
        </nav>

        <div className="min-w-0 space-y-10">
          <section id="overview" className="scroll-mt-5">
            <h2 className="text-lg font-semibold">Overview</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Info label="Base URL" value={`${origin}/api/pos/v1`} />
              <Info label="Version" value="v1" />
              <Info label="Data source" value="Odoo" />
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--oh-muted)]">Requests must use the store’s own domain. Every token is bound to one vendor, and every Odoo query is constrained to that vendor’s company. Direct database and Odoo RPC access are not part of this API.</p>
          </section>

          <section id="authentication" className="scroll-mt-5">
            <div className="flex items-center gap-2"><KeyRound size={18} className="text-[var(--oh-primary)]" /><h2 className="text-lg font-semibold">Authentication</h2></div>
            <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Create and revoke tokens from the signed-in store account’s Developer &amp; API settings. The token is shown once. Use a separate token per integration and grant only the required scopes.</p>
            <div className="mt-4 flex flex-wrap gap-2">{["api.read", "api.write", "api.batch", "api.webhook", "api.admin"].map((scope) => <span key={scope} className="rounded border border-[var(--oh-border)] px-2 py-1 font-mono text-xs">{scope}</span>)}</div>
            <div className="mt-4 flex items-start gap-2 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-muted)] p-3 text-sm"><Shield size={16} className="mt-0.5 shrink-0 text-emerald-700" /><p>Never place API tokens in URLs, browser storage, source control, or shared logs. Rotate a token immediately if it is exposed.</p></div>
          </section>

          <section id="resources" className="scroll-mt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold">Resources</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Read endpoints are available for the resources marked Ready.</p></div><label className="relative block w-full sm:w-64"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter resources" className="h-10 w-full rounded-md border border-[var(--oh-border-strong)] bg-[var(--oh-surface-elevated)] pl-9 pr-3 text-sm outline-none focus:border-[var(--oh-primary)]" /></label></div>
            <div className="mt-4 overflow-hidden rounded-md border border-[var(--oh-border)]">
              <div className="grid grid-cols-[minmax(100px,1fr)_minmax(140px,2fr)_90px_120px] gap-3 bg-[var(--oh-surface-muted)] px-3 py-2 text-xs font-semibold uppercase text-[var(--oh-muted)]"><span>Resource</span><span>Path</span><span>Read</span><span>Write</span></div>
              {filtered.map((item) => <div key={item.path} className="grid grid-cols-[minmax(100px,1fr)_minmax(140px,2fr)_90px_120px] gap-3 border-t border-[var(--oh-border)] px-3 py-3 text-sm"><span className="font-medium">{item.name}</span><code className="break-all text-xs text-[var(--oh-muted)]">/{item.path}</code><span className={item.read ? "text-emerald-700" : "text-[var(--oh-muted)]"}>{item.read ? "Ready" : "Planned"}</span><span className="text-[var(--oh-muted)]">{item.write}</span></div>)}
              {!filtered.length && <p className="px-3 py-6 text-center text-sm text-[var(--oh-muted)]">No matching resources.</p>}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2"><CodeLine method="GET" path="/products?offset=0&limit=100" /><CodeLine method="GET" path="/products/{id}" /><CodeLine method="POST" path="/sales:quote" /><CodeLine method="POST" path="/sales:batch" /><CodeLine method="POST" path="/inventory:batch" /><CodeLine method="POST" path="/purchases:batch" /><CodeLine method="GET" path="/operations/{id}" /><CodeLine method="POST" path="/webhooks" /></div>
          </section>

          <section id="batch-operations" className="scroll-mt-5">
            <h2 className="text-lg font-semibold">Batch operations</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Batch requests accept sales, full-sale refunds, inventory counts, and draft purchase orders when the corresponding server-side feature gate is enabled. Every record needs a stable sourceId. Accepted writes return an operation ID for status polling, and repeating the same Idempotency-Key replays the original result without creating another Odoo document.</p>
            <div className="mt-4 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-muted)] p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--oh-muted)]"><Terminal size={14} /> Example request</div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs leading-5">{example}</pre>
              <div className="mt-3 flex items-center gap-2"><input aria-label="API token for example" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Optional: preview with your token" className="h-9 min-w-0 flex-1 rounded border border-[var(--oh-border-strong)] bg-[var(--oh-surface-elevated)] px-2 text-xs" /><button onClick={copyExample} type="button" title="Copy curl example" className="grid size-9 shrink-0 place-items-center rounded border border-[var(--oh-border-strong)] hover:bg-[var(--oh-surface-elevated)]">{copied ? <Check size={15} /> : <Copy size={15} />}</button></div>
              <p className="mt-2 text-xs text-[var(--oh-muted)]">The token is used only in this page session to prepare the example; it is not saved.</p>
            </div>
          </section>

          <section id="webhooks" className="scroll-mt-5"><h2 className="text-lg font-semibold">Webhooks</h2><p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Subscriptions can be created and revoked with the `api.webhook` scope. Delivery attempts use an HMAC signature and retry transient failures for up to eight attempts. Configure `POS_API_WEBHOOK_ENCRYPTION_KEY` before registering an endpoint. Delivery history is retained for retry and audit.</p></section>
          <section id="errors" className="scroll-mt-5"><h2 className="text-lg font-semibold">Errors</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{[["401", "Token missing, expired, or revoked"], ["403", "Scope or store boundary mismatch"], ["404", "Resource not found in this store"], ["409", "Idempotency key conflict or resource state changed"], ["429", "Rate limit exceeded"], ["5xx", "Temporary API or Odoo service failure"]].map(([code, label]) => <div key={code} className="flex gap-3 rounded border border-[var(--oh-border)] px-3 py-2 text-sm"><code className="font-semibold">{code}</code><span className="text-[var(--oh-muted)]">{label}</span></div>)}</div></section>
        </div>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-md border border-[var(--oh-border)] p-3"><p className="text-xs text-[var(--oh-muted)]">{label}</p><p className="mt-1 break-all font-mono text-xs font-medium">{value}</p></div>; }
function CodeLine({ method, path }: { method: string; path: string }) { return <div className="flex min-w-0 items-center gap-2 rounded border border-[var(--oh-border)] px-3 py-2"><span className="w-12 shrink-0 font-mono text-[10px] font-bold text-emerald-700">{method}</span><code className="truncate text-xs">{path}</code></div>; }
