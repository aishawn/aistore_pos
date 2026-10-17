"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { AdminPageLayout, AdminSearchInput } from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList, useDebouncedValue } from "@/hooks/useApi";

const PAGE_SIZE = 20;

interface MailLog {
  id: number;
  recipient: string;
  subject: string;
  status: string;
  sentAt: string;
}

export default function MailLogPage() {
  const [recipient, setRecipient] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebouncedValue(recipient, 300);
  const { items, total, loading, error, reload } = useApiList<MailLog>("/api/mail-log", {
    recipient: dq || undefined,
    page,
    size: PAGE_SIZE,
  });

  return (
    <AdminPageLayout
      title="Mail Log"
      subtitle="Track sent and bounced emails"
      count={total}
      search={
        <AdminSearchInput
          label="Search"
          value={recipient}
          onChange={(v) => {
            setRecipient(v);
            setPage(1);
          }}
          placeholder="Search mail by recipient…"
        />
      }
    >
      {loading ? (
        <div role="status" aria-label="Loading mail log" className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white"><div className="grid grid-cols-5 gap-3 bg-[var(--oh-surface)] px-4 py-3">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-[var(--oh-border)]" />)}</div>{Array.from({ length: 5 }, (_, row) => <div key={row} className="grid grid-cols-5 gap-3 border-t border-[var(--oh-border)] px-4 py-4">{Array.from({ length: 5 }, (_, cell) => <div key={cell} className="h-4 animate-pulse rounded bg-[var(--oh-surface)]" />)}</div>)}</div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><span>{error}</span><button type="button" onClick={reload} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100"><RefreshCw size={15} /> Retry</button></div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--oh-border-strong)] bg-white px-4 py-12 text-center text-sm text-[var(--oh-muted)]">No mail log entries match the current search.</p>
      ) : (
        <ListTable
          columns={[
            { label: "Date" },
            { label: "Recipient" },
            { label: "Subject" },
            { label: "Status", width: "w-[160px]" },
          ]}
          rows={items.map((m) => [
            m.sentAt ?? "",
            m.recipient ?? "",
            m.subject ?? "",
            <span
              key="st"
              className={
                m.status === "Bounced" || m.status === "BOUNCED"
                  ? "text-[var(--oh-danger)]"
                  : "text-[var(--oh-success)]"
              }
            >
              {m.status ?? ""}
            </span>,
          ])}
        />
      )}
      <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
    </AdminPageLayout>
  );
}
