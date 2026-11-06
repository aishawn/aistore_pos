"use client";

import { useMemo, useState } from "react";
import { BookOpen, Check, Copy, ExternalLink, KeyRound, Search, Shield, Terminal } from "lucide-react";

const resources = [
  { name: "Products", path: "products", read: true, write: "Read only" },
  { name: "Sales", path: "sales", read: true, write: "Feature gated" },
  { name: "Refunds", path: "sales/{id} + sales:batch", read: true, write: "Full-sale refund" },
  { name: "Inventory", path: "inventory", read: true, write: "Count adjustment" },
  { name: "Purchases", path: "purchases", read: true, write: "Draft purchase orders" },
  { name: "Customers", path: "customers", read: true, write: "Read only" },
  { name: "Suppliers", path: "suppliers", read: true, write: "Read only" },
  { name: "Orders", path: "orders", read: true, write: "Read only" },
];

const requestExamples = {
  "Read products": {
    method: "GET",
    path: "/products?limit=50",
    body: null,
  },
  "Quote a sale": {
    method: "POST",
    path: "/sales:quote",
    body: { configId: 171, customerId: null, lines: [{ productId: 671846, quantity: 1, discountPercent: 0 }] },
  },
  "Create a sale": {
    method: "POST",
    path: "/sales:batch",
    body: [{ sourceId: "a6c19363-01af-49c8-a8c1-5a35cc130a7d", orderUuid: "a6c19363-01af-49c8-a8c1-5a35cc130a7d", configId: 171, sessionId: 141, paymentMethodId: 312, customerId: null, tendered: 21.99, expectedQuote: "QUOTE_SIGNATURE", lines: [{ productId: 671846, quantity: 1, discountPercent: 0 }] }],
  },
  Refund: {
    method: "POST",
    path: "/sales:batch",
    body: [{ sourceId: "b9f5ee23-6541-4871-8be9-09203727f148", orderUuid: "b9f5ee23-6541-4871-8be9-09203727f148", refundOfOrderId: 9001, configId: 171, sessionId: 141, paymentMethodId: 312, customerId: null, tendered: 21.99, lines: [{ productId: 671846, quantity: -1, refundedOrderLineId: 9876 }] }],
  },
  "Count inventory": {
    method: "POST",
    path: "/inventory:batch",
    body: [{ sourceId: "stocktake-2026-11-06-line-1", productId: 671846, locationId: 1609, expectedQty: 8, countedQty: 7 }],
  },
  "Draft purchase": {
    method: "POST",
    path: "/purchases:batch",
    body: [{ sourceId: "supplier-order-2026-11-06-001", supplierId: 450, lines: [{ productId: 671846, quantity: 12 }] }],
  },
  "Poll operation": {
    method: "GET",
    path: "/operations/OPERATION_ID",
    body: null,
  },
  Webhook: {
    method: "POST",
    path: "/webhooks",
    body: { url: "https://your-integration.example/webhooks/orithos", events: ["sale.created", "refund.created", "inventory.adjusted", "purchase.created", "operation.completed", "operation.failed"] },
  },
} as const;

export default function ApiDocsPage() {
  const [query, setQuery] = useState("");
  const [token, setToken] = useState("");
  const [exampleName, setExampleName] = useState<keyof typeof requestExamples>("Read products");
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "https://your-store.orithos.com.au" : window.location.origin;
  const filtered = useMemo(() => resources.filter((item) => `${item.name} ${item.path}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const selectedExample = requestExamples[exampleName];
  const example = [
    `curl -X ${selectedExample.method} "${origin}/api/pos/v1${selectedExample.path}"`,
    `-H "Authorization: Bearer ${token || "<API_TOKEN>"}"`,
    ...(selectedExample.method === "POST" && selectedExample.path.endsWith(":batch") ? ['-H "Idempotency-Key: your-unique-request-id"'] : []),
    ...(selectedExample.body ? ['-H "Content-Type: application/json"', `--data '${JSON.stringify(selectedExample.body, null, 2)}'`] : []),
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
        <a href="/api/pos/v1/openapi.yaml" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-medium hover:bg-[var(--oh-surface-muted)]" download><ExternalLink size={15} /> OpenAPI spec</a>
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
            <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Batch requests accept sales, full-sale refunds, inventory counts, and draft purchase orders when the corresponding server-side feature gate is enabled. Every record needs a stable sourceId. Accepted writes return an operation ID for status polling. Reuse the same Idempotency-Key and identical payload within 24 hours to replay the original result; changing the payload with that key returns 409.</p>
            <div className="mt-4 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-muted)] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-medium text-[var(--oh-muted)]"><Terminal size={14} /> Request example</div><select aria-label="Request example" value={exampleName} onChange={(event) => setExampleName(event.target.value as keyof typeof requestExamples)} className="h-9 max-w-full rounded border border-[var(--oh-border-strong)] bg-[var(--oh-surface-elevated)] px-2 text-xs">{Object.keys(requestExamples).map((name) => <option key={name}>{name}</option>)}</select></div>
              <div className="mb-2 flex items-center gap-2 text-[11px] text-[var(--oh-muted)]"><span className="rounded bg-[var(--oh-surface-elevated)] px-2 py-1 font-semibold text-emerald-700">{selectedExample.method}</span><code className="break-all">{selectedExample.path}</code></div>
              {exampleName === "Create a sale" && <p className="mb-2 text-xs leading-5 text-[var(--oh-muted)]">First call <code>/sales:quote</code> with the same config and lines, then replace the example signature. The POS validates current Odoo prices and tax before creating the order.</p>}
              {exampleName === "Refund" && <p className="mb-2 text-xs leading-5 text-[var(--oh-muted)]">Refunds must reference an eligible original sale and include its complete refundable line set. Partial refunds are rejected.</p>}
              {exampleName === "Count inventory" && <p className="mb-2 text-xs leading-5 text-[var(--oh-muted)]">Use the bound internal location and the latest expected quantity. A changed stock balance fails for reconciliation instead of overwriting newer stock.</p>}
              {exampleName === "Draft purchase" && <p className="mb-2 text-xs leading-5 text-[var(--oh-muted)]">This creates a draft purchase order. Receiving inventory remains a separate Odoo workflow.</p>}
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-3 font-mono text-xs leading-5">{example}</pre>
              <div className="mt-3 flex items-center gap-2"><input aria-label="API token for example" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Optional: preview with your token" className="h-9 min-w-0 flex-1 rounded border border-[var(--oh-border-strong)] bg-[var(--oh-surface-elevated)] px-2 text-xs" /><button onClick={copyExample} type="button" title="Copy curl example" className="grid size-9 shrink-0 place-items-center rounded border border-[var(--oh-border-strong)] hover:bg-[var(--oh-surface-elevated)]">{copied ? <Check size={15} /> : <Copy size={15} />}</button></div>
              <p className="mt-2 text-xs text-[var(--oh-muted)]">Replace example IDs with records from this store. A write response includes an operationId; poll it with GET /operations/{`{id}`} until it is completed or failed. The token is used only in this page session and is not saved.</p>
            </div>
          </section>

          <section id="webhooks" className="scroll-mt-5"><h2 className="text-lg font-semibold">Webhooks</h2><p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Subscriptions can be created and revoked with the `api.webhook` scope. Delivery attempts use an HMAC SHA-256 signature in `X-Orithos-Signature` over the exact raw request body. Compare signatures in constant time, deduplicate using the event `id`, and respond with a 2xx status. Failed deliveries retry every five minutes for up to eight attempts. HTTPS endpoints on public hosts are required; local and private network addresses are rejected. The signing secret is returned once when the subscription is created.</p><div className="mt-3 flex flex-wrap gap-2">{["sale.created", "refund.created", "inventory.adjusted", "purchase.created", "operation.completed", "operation.failed"].map((event) => <code key={event} className="rounded border border-[var(--oh-border)] px-2 py-1 text-xs">{event}</code>)}</div><p className="mt-3 text-xs text-[var(--oh-muted)]">Webhook secret encryption uses the configured POS API key or the existing token encryption key.</p></section>
          <section id="errors" className="scroll-mt-5"><h2 className="text-lg font-semibold">Errors</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{[["401", "Token missing, expired, or revoked"], ["403", "Scope or store boundary mismatch"], ["404", "Resource not found in this store"], ["409", "Idempotency key conflict or resource state changed"], ["429", "Rate limit exceeded"], ["5xx", "Temporary API or Odoo service failure"]].map(([code, label]) => <div key={code} className="flex gap-3 rounded border border-[var(--oh-border)] px-3 py-2 text-sm"><code className="font-semibold">{code}</code><span className="text-[var(--oh-muted)]">{label}</span></div>)}</div></section>
        </div>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-md border border-[var(--oh-border)] p-3"><p className="text-xs text-[var(--oh-muted)]">{label}</p><p className="mt-1 break-all font-mono text-xs font-medium">{value}</p></div>; }
function CodeLine({ method, path }: { method: string; path: string }) { return <div className="flex min-w-0 items-center gap-2 rounded border border-[var(--oh-border)] px-3 py-2"><span className="w-12 shrink-0 font-mono text-[10px] font-bold text-emerald-700">{method}</span><code className="truncate text-xs">{path}</code></div>; }
