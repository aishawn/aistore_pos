"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminOutlineButton,
  AdminPageLayout,
  AdminPrimaryButton,
  AdminSecondaryButton,
} from "@/components/admin/AdminPageLayout";
import { api, apiFailureMessage, Page } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/useApi";
import { useDialogFocus } from "@/hooks/useDialogFocus";

interface Quote {
  supplier?: string;
  listPrice?: number;
  effective?: number;
  total?: number;
  note?: string;
  chosen?: boolean;
}

interface Line {
  id: number;
  productId: number;
  productName: string;
  supplierId?: number | null;
  supplierName?: string | null;
  supplierSku?: string | null;
  channel: string;
  lastWeekSales: number;
  currentStock: number;
  incomingStock: number;
  expectedDemand: number;
  safetyStock: number;
  orderQty: number;
  caseQty: number;
  caseSize: number;
  unitCost?: number | null;
  lineCost?: number | null;
  saving?: number | null;
  confidence: number;
  confidenceLabel: string;
  unusual: boolean;
  reason?: string | null;
  decision?: string | null;
  comparisonJson?: string | null;
  status: string;
  orderId?: number | null;
}

interface SupplierGroup {
  supplierId: number;
  supplierName: string;
  skuCount: number;
  spend: number;
  saving: number;
  orderId?: number | null;
}

interface EmailDraft {
  id: number;
  supplierId?: number | null;
  supplierName?: string | null;
  toEmail?: string | null;
  subject: string;
  body: string;
  status: string;
  skuCount: number;
}

interface Plan {
  id: number;
  weekStart: string;
  weekEnd: string;
  holidayNote?: string | null;
  productCount: number;
  totalUnits: number;
  estimatedSpend: number;
  estimatedSaving: number;
  ready: SupplierGroup[];
  emails: EmailDraft[];
  other: Line[];
  lines: Line[];
}

interface Named {
  id: number;
  name: string;
  email?: string | null;
}

interface Settings {
  suppliers: Named[];
  preferences: Array<{
    id: number;
    supplierId: number;
    supplierName: string;
    priority: number;
    switchThreshold?: number | null;
    channel: string;
  }>;
  prices: Array<{
    id: number;
    productName: string;
    supplierName: string;
    supplierSku?: string | null;
    basePrice: number;
    caseSize: number;
    effectiveFrom: string;
    effectiveTo?: string | null;
    source: string;
  }>;
  deals: Array<{
    id: number;
    supplierName: string;
    name: string;
    dealType: string;
    buyQuantity: number;
    freeQuantity: number;
    discountPercent?: number | null;
    mixMatch: boolean;
    requiresRep: boolean;
  }>;
  rules: Array<{
    id: number;
    productName: string;
    supplierMode: string;
    supplierName?: string | null;
  }>;
  events: Array<{
    id: number;
    eventDate: string;
    name: string;
    adjustmentPercent?: number | null;
  }>;
}

type Selection =
  | { kind: "ready"; supplierId: number }
  | { kind: "email"; draftId: number }
  | { kind: "other" };

function money(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function qty(value?: number | null) {
  if (value == null) return "0";
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function quotesOf(line: Line): Quote[] {
  if (!line.comparisonJson) return [];
  try {
    const parsed = JSON.parse(line.comparisonJson) as { quotes?: Quote[] };
    return parsed.quotes ?? [];
  } catch {
    return [];
  }
}

function confidenceClass(label: string) {
  if (label === "High") return "bg-[var(--oh-tile-green-bg)] text-[var(--oh-tile-green-text)]";
  if (label === "Medium") return "bg-[var(--oh-tile-orange-bg)] text-[var(--oh-tile-orange-text)]";
  return "bg-[var(--oh-tile-red-bg)] text-[var(--oh-tile-red-text)]";
}

export function SupplyChainPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [openLineId, setOpenLineId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useDialogFocus(Boolean(draft), () => {
    if (!busy) setDraft(null);
  });

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<Plan>("/api/supply-chain/plan");
      setPlan(data);
      setError(null);
      setSelection((current) => current ?? firstSelection(data));
    } catch (e) {
      setError(apiFailureMessage(e, "Could not load this week's purchase plan.", "Please sign in again."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(apiFailureMessage(e, "That action failed.", "Please sign in again."));
    } finally {
      setBusy(false);
    }
  }

  const visibleLines = useMemo(() => {
    if (!plan || !selection) return [];
    if (selection.kind === "other") return plan.other;
    if (selection.kind === "ready") {
      return plan.lines.filter((line) => line.channel === "API" && line.supplierId === selection.supplierId);
    }
    const email = plan.emails.find((item) => item.id === selection.draftId);
    if (!email) return [];
    return plan.lines.filter((line) => line.channel === "EMAIL" && line.supplierId === email.supplierId);
  }, [plan, selection]);

  return (
    <AdminPageLayout
      title="Order Stock"
      subtitle="Orion AI Supply Chain — what to buy, how many, and from whom"
      compact
      fullBleed
      actions={
        <>
          <AdminOutlineButton className="min-h-11" onClick={() => router.push("/orders/manual")}>Manual order</AdminOutlineButton>
          <AdminSecondaryButton className="min-h-11" onClick={() => setSettingsOpen((open) => !open)}>
            {settingsOpen ? "Back to plan" : "Rules & prices"}
          </AdminSecondaryButton>
          <AdminPrimaryButton
            className="min-h-11"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const data = await api.post<Plan>("/api/supply-chain/plan/generate");
                setPlan(data);
                setSelection(firstSelection(data));
              })
            }
          >
            {busy ? "Working…" : "Regenerate"}
          </AdminPrimaryButton>
        </>
      }
    >
      {error && (
        <div className="mb-3 rounded-[var(--oh-radius)] border border-[var(--oh-tile-red-border)] bg-[var(--oh-tile-red-bg)] px-3 py-2 text-[13px] text-[var(--oh-tile-red-text)]">
          {error}
        </div>
      )}

      {settingsOpen ? (
        <SettingsPanel />
      ) : loading ? (
        <div role="status" aria-live="polite" className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-10 text-center text-[13px] text-[var(--oh-muted)]">
          Building this week&apos;s purchase plan…
        </div>
      ) : !plan ? (
        <div className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-10 text-center text-[13px] text-[var(--oh-muted)]">
          The purchase plan did not load.
          <div className="mt-3">
            <AdminPrimaryButton onClick={() => void load()}>Try again</AdminPrimaryButton>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="grid gap-3 xl:grid-cols-[1.4fr_1fr_1fr]">
            <div className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)]">
              <div className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
                This week · {plan.weekStart} to {plan.weekEnd}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Metric label="Products" value={String(plan.productCount)} />
                <Metric label="Est. spend" value={money(plan.estimatedSpend)} />
                <Metric label="AI saving" value={money(plan.estimatedSaving)} />
              </div>
              <p className="mt-3 text-[13px] leading-5 text-[var(--oh-text-secondary)]">
                {plan.holidayNote ? `${plan.holidayNote}. ` : ""}
                Quantity is forecast + safety stock − on hand − incoming, then rounded to the supplier case size.
                You confirm the cart or the email. Nothing is paid automatically.
              </p>
            </div>
            <ChannelCard
              tone="ready"
              title="Ready to order"
              empty="No supplier carts"
              items={plan.ready.map((group) => ({
                key: group.supplierId,
                title: group.supplierName,
                detail: `${group.skuCount} SKUs · ${money(group.spend)}`,
                active: selection?.kind === "ready" && selection.supplierId === group.supplierId,
                onClick: () => setSelection({ kind: "ready", supplierId: group.supplierId }),
              }))}
            />
            <div className="grid gap-3">
              <ChannelCard
                tone="email"
                title="Email drafts"
                empty="No rep orders"
                items={plan.emails.map((email) => ({
                  key: email.id,
                  title: email.supplierName || "Sales rep",
                  detail: `${email.skuCount} SKUs · ${email.status === "REVIEWED" ? "Reviewed" : "Draft"}`,
                  active: selection?.kind === "email" && selection.draftId === email.id,
                  onClick: () => {
                    setSelection({ kind: "email", draftId: email.id });
                    setDraft(email);
                  },
                }))}
              />
              <button
                type="button"
                onClick={() => setSelection({ kind: "other" })}
                className={`rounded-[var(--oh-radius)] border px-4 py-3 text-left shadow-[var(--oh-shadow-card)] ${
                  selection?.kind === "other"
                    ? "border-[var(--oh-primary)] bg-[var(--oh-surface-muted)]"
                    : "border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]"
                } min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]`}
                aria-pressed={selection?.kind === "other"}
              >
                <div className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-info)]">Other purchases</div>
                <div className="mt-1 text-[18px] font-semibold text-[var(--oh-text)]">{plan.other.length}</div>
                <div className="text-[13px] text-[var(--oh-muted)]">Manual tasks with no API or email</div>
              </button>
            </div>
          </section>

          <section className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] shadow-[var(--oh-shadow-card)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--oh-border)] px-4 py-3">
              <div>
                <h2 className="text-[15px] font-semibold text-[var(--oh-text)]">{selectionTitle(plan, selection)}</h2>
                <p className="text-[13px] text-[var(--oh-muted)]">{visibleLines.length} lines</p>
              </div>
              {selection?.kind === "ready" && (
                <AdminPrimaryButton
                  className="min-h-11"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await api.post<{ orderId: number; plan: Plan }>(
                        `/api/supply-chain/suppliers/${selection.supplierId}/cart`,
                      );
                      setPlan(result.plan);
                      router.push(`/orders/${result.orderId}/edit`);
                    })
                  }
                >
                  Open cart
                </AdminPrimaryButton>
              )}
              {selection?.kind === "email" && draft && (
                <AdminPrimaryButton className="min-h-11" onClick={() => setDraft(plan.emails.find((item) => item.id === draft.id) ?? draft)}>
                  Open email draft
                </AdminPrimaryButton>
              )}
            </div>

            {visibleLines.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-[var(--oh-muted)]">
                Stock covers the forecast for this channel. Regenerate after sales, prices, or a holiday change.
              </div>
            ) : (
              <>
              <div className="hidden overflow-x-auto lg:block">
                <table aria-label="Supply chain recommendations" className="w-full min-w-[760px] text-left text-[13px]">
                  <thead className="text-[13px] uppercase tracking-wide text-[var(--oh-muted)]">
                    <tr className="border-b border-[var(--oh-border)]">
                      <th scope="col" className="px-4 py-2 font-semibold">Product</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Qty</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Effective</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Reason</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Confidence</th>
                      <th scope="col" className="px-4 py-2 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLines.map((line) => (
                      <LineRows
                        key={line.id}
                        line={line}
                        open={openLineId === line.id}
                        busy={busy}
                        onToggle={() => setOpenLineId((id) => (id === line.id ? null : line.id))}
                        onDecision={(status) =>
                          void run(async () => {
                            const next = await api.post<Plan>(`/api/supply-chain/lines/${line.id}/decision`, { status });
                            setPlan(next);
                          })
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="grid gap-3 p-3 lg:hidden">
                {visibleLines.map((line) => (
                  <LineCard
                    key={line.id}
                    line={line}
                    open={openLineId === line.id}
                    busy={busy}
                    onToggle={() => setOpenLineId((id) => (id === line.id ? null : line.id))}
                    onDecision={(status) =>
                      void run(async () => {
                        const next = await api.post<Plan>(`/api/supply-chain/lines/${line.id}/decision`, { status });
                        setPlan(next);
                      })
                    }
                  />
                ))}
              </ul>
              </>
            )}
          </section>
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDraft(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="supply-email-draft-title" className="max-h-[85vh] w-full max-w-xl overflow-auto rounded-[var(--oh-radius)] bg-[var(--oh-surface-elevated)] p-5 shadow-xl">
            <div className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">Email draft</div>
            <h3 id="supply-email-draft-title" className="mt-1 text-[16px] font-semibold">{draft.subject}</h3>
            <p className="mt-1 text-[13px] text-[var(--oh-text-secondary)]">To: {draft.toEmail || "No rep email on file"}</p>
            <pre className="mt-3 whitespace-pre-wrap rounded bg-[var(--oh-surface)] p-3 text-[13px] leading-5 text-[var(--oh-text)]">
              {draft.body}
            </pre>
            <p className="mt-3 text-[13px] text-[var(--oh-muted)]">
              Orion keeps this as a draft. Copy it into your mailbox and send it yourself.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <AdminSecondaryButton className="min-h-11" onClick={() => setDraft(null)}>Close</AdminSecondaryButton>
              <AdminOutlineButton
                className="min-h-11"
                onClick={() => void navigator.clipboard.writeText(`To: ${draft.toEmail || ""}\nSubject: ${draft.subject}\n\n${draft.body}`)}
              >
                Copy
              </AdminOutlineButton>
              <AdminPrimaryButton
                className="min-h-11"
                disabled={busy || draft.status === "REVIEWED"}
                onClick={() =>
                  void run(async () => {
                    const next = await api.post<Plan>(`/api/supply-chain/drafts/${draft.id}/review`);
                    setPlan(next);
                    setDraft(next.emails.find((item) => item.id === draft.id) ?? { ...draft, status: "REVIEWED" });
                  })
                }
              >
                {draft.status === "REVIEWED" ? "Reviewed" : "Mark reviewed"}
              </AdminPrimaryButton>
            </div>
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
}

function firstSelection(plan: Plan): Selection | null {
  if (plan.ready[0]) return { kind: "ready", supplierId: plan.ready[0].supplierId };
  if (plan.emails[0]) return { kind: "email", draftId: plan.emails[0].id };
  if (plan.other.length > 0) return { kind: "other" };
  return null;
}

function selectionTitle(plan: Plan, selection: Selection | null) {
  if (!selection) return "Purchase lines";
  if (selection.kind === "other") return "Other purchases";
  if (selection.kind === "email") {
    return plan.emails.find((item) => item.id === selection.draftId)?.supplierName || "Email draft";
  }
  return plan.ready.find((item) => item.supplierId === selection.supplierId)?.supplierName || "Ready to order";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[20px] font-semibold leading-none text-[var(--oh-text)]">{value}</div>
      <div className="mt-1 text-[13px] uppercase tracking-wide text-[var(--oh-muted)]">{label}</div>
    </div>
  );
}

function ChannelCard({
  title,
  empty,
  tone,
  items,
}: {
  title: string;
  empty: string;
  tone: "ready" | "email";
  items: Array<{ key: number; title: string; detail: string; active: boolean; onClick: () => void }>;
}) {
  return (
    <div className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)]">
      <div className={`text-[13px] font-semibold uppercase tracking-wider ${tone === "ready" ? "text-[var(--oh-tile-green-text)]" : "text-[var(--oh-tile-orange-text)]"}`}>
        {title}
      </div>
      <div className="mt-2 space-y-2">
        {items.length === 0 && <div className="text-[13px] text-[var(--oh-muted)]">{empty}</div>}
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            aria-pressed={item.active}
            className={`block min-h-11 w-full rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] ${
              item.active ? "border-[var(--oh-orange)] bg-[var(--oh-orange-light)]" : "border-[var(--oh-border)]"
            }`}
          >
            <div className="text-[14px] font-semibold text-[var(--oh-text)]">{item.title}</div>
            <div className="text-[13px] text-[var(--oh-muted)]">{item.detail}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function LineRows({
  line,
  open,
  busy,
  onToggle,
  onDecision,
}: {
  line: Line;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onDecision: (status: "APPROVED" | "REJECTED") => void;
}) {
  const quotes = quotesOf(line);
  return (
    <>
      <tr className="border-b border-[var(--oh-border)] align-top">
        <td className="px-4 py-3">
          <div className="font-medium text-[var(--oh-text)]">{line.productName}</div>
          <div className="text-[13px] text-[var(--oh-muted)]">
            {line.supplierName || "No supplier"}
            {line.supplierSku ? ` · ${line.supplierSku}` : ""}
            {line.unusual ? " · Unusual quantity" : ""}
          </div>
        </td>
        <td className="px-3 py-3">
          {qty(line.orderQty)}
          <div className="text-[13px] text-[var(--oh-muted)]">{qty(line.caseQty)} cases</div>
        </td>
        <td className="px-3 py-3">
          {money(line.unitCost)}
          <div className="text-[13px] text-[var(--oh-muted)]">{money(line.lineCost)} line</div>
        </td>
        <td className="px-3 py-3 text-[var(--oh-text-secondary)]">{line.reason || "—"}</td>
        <td className="px-3 py-3">
          <span className={`rounded px-2 py-0.5 text-[13px] font-semibold ${confidenceClass(line.confidenceLabel)}`}>
            {line.confidenceLabel} {line.confidence}%
          </span>
          <div className="mt-1 text-[13px] uppercase tracking-wide text-[var(--oh-muted)]">{line.status.replaceAll("_", " ")}</div>
        </td>
        <td className="px-4 py-3 text-right">
          <button type="button" aria-expanded={open} onClick={onToggle} className="inline-flex min-h-11 items-center rounded-md px-2 text-[13px] font-semibold text-[var(--oh-primary)] hover:bg-[var(--oh-tile-blue-bg)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">
            {open ? "Hide details" : "Why this quantity?"}
          </button>
          {line.status !== "ORDERED" && line.status !== "REJECTED" && (
            <div className="mt-1 flex justify-end gap-2">
              {line.status === "NEEDS_REVIEW" && (
                <button type="button" disabled={busy} onClick={() => onDecision("APPROVED")} className="inline-flex min-h-11 items-center rounded-md px-2 text-[13px] font-semibold text-[var(--oh-tile-green-text)] hover:bg-[var(--oh-tile-green-bg)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50">
                  Approve
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => onDecision("REJECTED")} className="inline-flex min-h-11 items-center rounded-md px-2 text-[13px] font-semibold text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50">
                Skip
              </button>
            </div>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-[var(--oh-border)] bg-[var(--oh-surface)]">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="text-[13px] leading-6 text-[var(--oh-text)]">
                <div className="font-semibold">Why this quantity</div>
                Last week {qty(line.lastWeekSales)} · Forecast {qty(line.expectedDemand)} · On hand {qty(line.currentStock)} · Incoming {qty(line.incomingStock)} · Safety {qty(line.safetyStock)}
                <div>Recommended {qty(line.orderQty)} units / {qty(line.caseQty)} cases.</div>
                <div className="mt-2 font-semibold">Why this supplier</div>
                <div>{line.decision || "No priced supplier."}</div>
              </div>
              <div className="space-y-1 text-[13px]">
                {quotes.length === 0 && <div className="text-[var(--oh-muted)]">No supplier price was on file.</div>}
                {quotes.map((quote) => (
                  <div key={`${quote.supplier}-${quote.total}`} className="flex items-baseline justify-between gap-3">
                    <span className={quote.chosen ? "font-semibold text-[var(--oh-text)]" : "text-[var(--oh-text-secondary)]"}>
                      {quote.supplier} {quote.chosen ? "· selected" : ""}
                    </span>
                    <span>
                      {money(quote.effective)} / case
                      <span className="ml-2 text-[13px] text-[var(--oh-muted)]">{quote.note}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function LineCard({
  line,
  open,
  busy,
  onToggle,
  onDecision,
}: {
  line: Line;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onDecision: (status: "APPROVED" | "REJECTED") => void;
}) {
  const quotes = quotesOf(line);
  return (
    <li className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-semibold text-[var(--oh-text)]">{line.productName}</h3>
          <p className="mt-1 break-words text-xs leading-5 text-[var(--oh-muted)]">
            {line.supplierName || "No supplier"}{line.supplierSku ? ` · ${line.supplierSku}` : ""}{line.unusual ? " · Unusual quantity" : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${confidenceClass(line.confidenceLabel)}`}>
          {line.confidenceLabel} {line.confidence}%
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--oh-border)] pt-3">
        <div><p className="text-xs text-[var(--oh-muted)]">Order quantity</p><p className="mt-1 text-sm font-semibold tabular-nums text-[var(--oh-text)]">{qty(line.orderQty)} <span className="text-xs font-normal text-[var(--oh-muted)]">· {qty(line.caseQty)} cases</span></p></div>
        <div><p className="text-xs text-[var(--oh-muted)]">Effective cost</p><p className="mt-1 text-sm font-semibold tabular-nums text-[var(--oh-text)]">{money(line.unitCost)} <span className="text-xs font-normal text-[var(--oh-muted)]">/ unit</span></p></div>
        <div className="col-span-2"><p className="text-xs text-[var(--oh-muted)]">Reason</p><p className="mt-1 text-sm leading-5 text-[var(--oh-text-secondary)]">{line.reason || "No reason provided"}</p></div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--oh-border)] pt-2">
        <button type="button" aria-expanded={open} onClick={onToggle} className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-[var(--oh-primary)] hover:bg-[var(--oh-tile-blue-bg)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">
          {open ? "Hide details" : "Why this quantity?"}
        </button>
        {line.status !== "ORDERED" && line.status !== "REJECTED" && (
          <div className="flex gap-1">
            {line.status === "NEEDS_REVIEW" && <button type="button" disabled={busy} onClick={() => onDecision("APPROVED")} className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-[var(--oh-tile-green-text)] hover:bg-[var(--oh-tile-green-bg)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50">Approve</button>}
            <button type="button" disabled={busy} onClick={() => onDecision("REJECTED")} className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50">Skip</button>
          </div>
        )}
      </div>

      {open && (
        <div className="mt-2 grid gap-3 rounded-lg bg-[var(--oh-surface)] p-3 text-[13px] leading-5 text-[var(--oh-text-secondary)]">
          <div>
            <h4 className="font-semibold text-[var(--oh-text)]">Quantity breakdown</h4>
            <p className="mt-1">Last week {qty(line.lastWeekSales)} · Forecast {qty(line.expectedDemand)} · On hand {qty(line.currentStock)} · Incoming {qty(line.incomingStock)} · Safety stock {qty(line.safetyStock)}</p>
            <p>Recommended {qty(line.orderQty)} units / {qty(line.caseQty)} cases.</p>
          </div>
          <div>
            <h4 className="font-semibold text-[var(--oh-text)]">Supplier comparison</h4>
            <p className="mt-1">{line.decision || "No priced supplier."}</p>
            {quotes.length === 0 ? <p className="mt-1 text-[var(--oh-muted)]">No supplier price was on file.</p> : quotes.map((quote) => (
              <p key={`${quote.supplier}-${quote.total}`} className="mt-1 flex flex-wrap justify-between gap-x-3">
                <span className={quote.chosen ? "font-semibold text-[var(--oh-text)]" : ""}>{quote.supplier}{quote.chosen ? " · selected" : ""}</span>
                <span>{money(quote.effective)} / case{quote.note ? ` · ${quote.note}` : ""}</span>
              </p>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const debounced = useDebouncedValue(productQuery, 300);
  const [products, setProducts] = useState<Array<{ id: number; name: string }>>([]);
  const visibleProducts = productQuery.trim() ? products : [];
  const productRequestRef = useRef(0);
  const [pref, setPref] = useState({ supplierId: "", priority: "1", threshold: "", channel: "API" });
  const [price, setPrice] = useState({ productId: "", supplierId: "", sku: "", basePrice: "", caseSize: "6" });
  const [deal, setDeal] = useState({
    supplierId: "",
    name: "",
    dealType: "BUY_X_GET_Y",
    buyQuantity: "10",
    freeQuantity: "1",
    discountPercent: "",
    discountAmount: "",
    eligibleProducts: "",
    requiresRep: false,
    mixMatch: false,
  });
  const [rule, setRule] = useState({ productId: "", supplierMode: "LOCKED", supplierId: "" });
  const [event, setEvent] = useState({ eventDate: "", name: "", adjustmentPercent: "15" });

  async function load() {
    const data = await api.get<Settings>("/api/supply-chain/settings");
    setSettings(data);
  }

  useEffect(() => {
    // This effect hydrates the settings panel from the remote store once it opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((e) => setError(apiFailureMessage(e, "Could not load rules.", "Please sign in again.")));
  }, []);

  useEffect(() => {
    const requestId = ++productRequestRef.current;
    if (!debounced.trim()) {
      return;
    }
    void api
      .get<Page<{ id: number; name: string }>>("/api/products", { name: debounced, size: 8, status: "ACTIVE" })
      .then((page) => {
        if (requestId === productRequestRef.current) setProducts(page.items);
      })
      .catch(() => {
        if (requestId === productRequestRef.current) setProducts([]);
      });
  }, [debounced]);

  async function save(action: () => Promise<Settings>) {
    setError(null);
    try {
      setSettings(await action());
    } catch (e) {
      setError(apiFailureMessage(e, "Could not save.", "Please sign in again."));
    }
  }

  const field = "h-9 w-full rounded border border-[var(--oh-border)] bg-[var(--oh-surface)] px-2 text-[13px] text-[var(--oh-text)] placeholder:text-[var(--oh-muted)]";

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[var(--oh-text-secondary)]">
        Prices come from what you enter here, or from the last purchase cost already on the product. Regenerate the plan after changing rules.
      </p>
      {error && <div className="rounded border border-[var(--oh-tile-red-border)] bg-[var(--oh-tile-red-bg)] px-3 py-2 text-[13px] text-[var(--oh-tile-red-text)]">{error}</div>}
      <div className="grid gap-4 xl:grid-cols-2">
        <form
          className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4"
          onSubmit={(e) => e.preventDefault()}
        >
          <h3 className="text-[14px] font-semibold">Preferred supplier</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select aria-label="Preferred supplier" className={field} value={pref.supplierId} onChange={(e) => setPref({ ...pref, supplierId: e.target.value })} required>
              <option value="">Supplier</option>
              {settings?.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
            <input aria-label="Supplier priority" className={field} value={pref.priority} onChange={(e) => setPref({ ...pref, priority: e.target.value })} placeholder="Priority" />
            <input aria-label="Switch if saving per case" className={field} value={pref.threshold} onChange={(e) => setPref({ ...pref, threshold: e.target.value })} placeholder="Switch if saving $/case" />
            <select aria-label="Preferred ordering channel" className={field} value={pref.channel} onChange={(e) => setPref({ ...pref, channel: e.target.value })}>
              <option value="API">Ready to order</option>
              <option value="EMAIL">Sales rep email</option>
              <option value="OTHER">Manual task</option>
            </select>
          </div>
          <div className="mt-3">
            <AdminPrimaryButton
              onClick={() =>
                void save(() =>
                  api.put<Settings>("/api/supply-chain/preferences", {
                    supplierId: Number(pref.supplierId),
                    priority: Number(pref.priority || 1),
                    switchThreshold: pref.threshold === "" ? null : Number(pref.threshold),
                    channel: pref.channel,
                  }),
                )
              }
            >
              Save preference
            </AdminPrimaryButton>
          </div>
          <ul className="mt-3 space-y-1 text-[13px] text-[var(--oh-text-secondary)]">
            {settings?.preferences.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2">
                <span>{item.supplierName} · priority {item.priority} · {item.channel}</span>
                <button type="button" aria-label={`Remove preference for ${item.supplierName}`} className="text-[var(--oh-danger)]" onClick={() => void save(() => api.del<Settings>(`/api/supply-chain/preferences/${item.id}`))}>Remove</button>
              </li>
            ))}
          </ul>
        </form>

        <form
          className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4"
          onSubmit={(e) => e.preventDefault()}
        >
          <h3 className="text-[14px] font-semibold">Supplier case price</h3>
          <input aria-label="Search products for supplier pricing" className={`${field} mt-3`} value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Search product" />
          {visibleProducts.length > 0 && (
            <div className="mt-1 max-h-28 overflow-auto rounded border border-[var(--oh-border)]">
              {visibleProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="block w-full px-2 py-1 text-left text-[13px] hover:bg-[var(--oh-surface)]"
                  onClick={() => {
                    setPrice({ ...price, productId: String(product.id) });
                    setRule((current) => ({ ...current, productId: String(product.id) }));
                    setProductQuery(product.name);
                    setProducts([]);
                  }}
                >
                  {product.name}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <select aria-label="Price supplier" className={field} value={price.supplierId} onChange={(e) => setPrice({ ...price, supplierId: e.target.value })} required>
              <option value="">Supplier</option>
              {settings?.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
            <input aria-label="Supplier SKU" className={field} value={price.sku} onChange={(e) => setPrice({ ...price, sku: e.target.value })} placeholder="Supplier SKU" />
            <input aria-label="Price per case" className={field} value={price.basePrice} onChange={(e) => setPrice({ ...price, basePrice: e.target.value })} placeholder="Price per case" required />
            <input aria-label="Case size" className={field} value={price.caseSize} onChange={(e) => setPrice({ ...price, caseSize: e.target.value })} placeholder="Case size" />
          </div>
          <div className="mt-3">
            <AdminPrimaryButton
              onClick={() =>
                void save(() =>
                  api.post<Settings>("/api/supply-chain/prices", {
                    productId: Number(price.productId),
                    supplierId: Number(price.supplierId),
                    supplierSku: price.sku,
                    basePrice: Number(price.basePrice),
                    caseSize: Number(price.caseSize || 1),
                  }),
                )
              }
            >
              Add price
            </AdminPrimaryButton>
          </div>
          <ul className="mt-3 space-y-1 text-[13px] text-[var(--oh-text-secondary)]">
            {settings?.prices.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2">
                <span>{item.productName} · {item.supplierName} · {money(item.basePrice)}</span>
                <button type="button" aria-label={`Remove price for ${item.productName}`} className="text-[var(--oh-danger)]" onClick={() => void save(() => api.del<Settings>(`/api/supply-chain/prices/${item.id}`))}>Remove</button>
              </li>
            ))}
          </ul>
        </form>

        <form
          className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4"
          onSubmit={(e) => e.preventDefault()}
        >
          <h3 className="text-[14px] font-semibold">Deal</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select aria-label="Deal supplier" className={field} value={deal.supplierId} onChange={(e) => setDeal({ ...deal, supplierId: e.target.value })} required>
              <option value="">Supplier</option>
              {settings?.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
            <input aria-label="Deal name" className={field} value={deal.name} onChange={(e) => setDeal({ ...deal, name: e.target.value })} placeholder="Deal name" required />
            <select aria-label="Deal type" className={field} value={deal.dealType} onChange={(e) => setDeal({ ...deal, dealType: e.target.value })}>
              <option value="BUY_X_GET_Y">Buy X get Y</option>
              <option value="PERCENT">Percent off</option>
              <option value="AMOUNT_OFF">Amount off / case</option>
            </select>
            <input aria-label="Deal buy cases" className={field} value={deal.buyQuantity} onChange={(e) => setDeal({ ...deal, buyQuantity: e.target.value })} placeholder="Buy cases" />
            <input aria-label="Deal free cases" className={field} value={deal.freeQuantity} onChange={(e) => setDeal({ ...deal, freeQuantity: e.target.value })} placeholder="Free cases" />
            <input aria-label="Deal discount percent" className={field} value={deal.discountPercent} onChange={(e) => setDeal({ ...deal, discountPercent: e.target.value })} placeholder="Discount %" />
            <input aria-label="Eligible product IDs" className={field} value={deal.eligibleProducts} onChange={(e) => setDeal({ ...deal, eligibleProducts: e.target.value })} placeholder="Product ids, blank = all" />
          </div>
          <label className="mt-2 flex items-center gap-2 text-[13px]">
            <input aria-label="Mix and match across SKUs" type="checkbox" checked={deal.mixMatch} onChange={(e) => setDeal({ ...deal, mixMatch: e.target.checked })} />
            Mix & match across SKUs
          </label>
          <label className="mt-1 flex items-center gap-2 text-[13px]">
            <input aria-label="Must be ordered through sales representative" type="checkbox" checked={deal.requiresRep} onChange={(e) => setDeal({ ...deal, requiresRep: e.target.checked })} />
            Must be ordered through the sales rep
          </label>
          <div className="mt-3">
            <AdminPrimaryButton
              onClick={() =>
                void save(() =>
                  api.post<Settings>("/api/supply-chain/deals", {
                    ...deal,
                    supplierId: Number(deal.supplierId),
                    buyQuantity: Number(deal.buyQuantity || 0),
                    freeQuantity: Number(deal.freeQuantity || 0),
                    discountPercent: deal.discountPercent === "" ? null : Number(deal.discountPercent),
                    discountAmount: deal.discountAmount === "" ? null : Number(deal.discountAmount),
                  }),
                )
              }
            >
              Add deal
            </AdminPrimaryButton>
          </div>
          <ul className="mt-3 space-y-1 text-[13px] text-[var(--oh-text-secondary)]">
            {settings?.deals.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2">
                <span>{item.name} · {item.supplierName}</span>
                <button type="button" aria-label={`Remove deal ${item.name}`} className="text-[var(--oh-danger)]" onClick={() => void save(() => api.del<Settings>(`/api/supply-chain/deals/${item.id}`))}>Remove</button>
              </li>
            ))}
          </ul>
        </form>

        <div className="space-y-4">
          <form
            className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4"
            onSubmit={(e) => e.preventDefault()}
          >
            <h3 className="text-[14px] font-semibold">Product supplier rule</h3>
            <p className="mt-1 text-[13px] text-[var(--oh-muted)]">Search a product in the price card to fill this id, or type it.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <input aria-label="Rule product ID" className={field} value={rule.productId} onChange={(e) => setRule({ ...rule, productId: e.target.value })} placeholder="Product id" required />
              <select aria-label="Rule supplier mode" className={field} value={rule.supplierMode} onChange={(e) => setRule({ ...rule, supplierMode: e.target.value })}>
                <option value="LOCKED">Locked supplier</option>
                <option value="OPTIMIZE">Compare suppliers</option>
              </select>
              <select aria-label="Rule supplier" className={field} value={rule.supplierId} onChange={(e) => setRule({ ...rule, supplierId: e.target.value })}>
                <option value="">Supplier</option>
                {settings?.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </div>
            <div className="mt-3">
              <AdminPrimaryButton
                onClick={() =>
                  void save(() =>
                    api.put<Settings>("/api/supply-chain/rules", {
                      productId: Number(rule.productId),
                      supplierMode: rule.supplierMode,
                      supplierId: rule.supplierId === "" ? null : Number(rule.supplierId),
                    }),
                  )
                }
              >
                Save rule
              </AdminPrimaryButton>
            </div>
            <ul className="mt-3 space-y-1 text-[13px] text-[var(--oh-text-secondary)]">
              {settings?.rules.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2">
                  <span>{item.productName} · {item.supplierMode} {item.supplierName || ""}</span>
                <button type="button" aria-label={`Remove rule for ${item.productName}`} className="text-[var(--oh-danger)]" onClick={() => void save(() => api.del<Settings>(`/api/supply-chain/rules/${item.id}`))}>Remove</button>
                </li>
              ))}
            </ul>
          </form>

          <form
            className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4"
            onSubmit={(e) => e.preventDefault()}
          >
            <h3 className="text-[14px] font-semibold">Upcoming holiday</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <input aria-label="Holiday date" className={field} type="date" value={event.eventDate} onChange={(e) => setEvent({ ...event, eventDate: e.target.value })} required />
              <input aria-label="Public holiday name" className={field} value={event.name} onChange={(e) => setEvent({ ...event, name: e.target.value })} placeholder="Public holiday" required />
              <input aria-label="Demand lift percent" className={field} value={event.adjustmentPercent} onChange={(e) => setEvent({ ...event, adjustmentPercent: e.target.value })} placeholder="Demand lift %" />
            </div>
            <div className="mt-3">
              <AdminPrimaryButton
                onClick={() =>
                  void save(() =>
                    api.post<Settings>("/api/supply-chain/events", {
                      eventDate: event.eventDate,
                      name: event.name,
                      adjustmentPercent: Number(event.adjustmentPercent || 0),
                    }),
                  )
                }
              >
                Add event
              </AdminPrimaryButton>
            </div>
            <ul className="mt-3 space-y-1 text-[13px] text-[var(--oh-text-secondary)]">
              {settings?.events.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2">
                  <span>{item.eventDate} · {item.name} · +{qty(item.adjustmentPercent)}%</span>
                <button type="button" aria-label={`Remove holiday ${item.name}`} className="text-[var(--oh-danger)]" onClick={() => void save(() => api.del<Settings>(`/api/supply-chain/events/${item.id}`))}>Remove</button>
                </li>
              ))}
            </ul>
          </form>
        </div>
      </div>
    </div>
  );
}
