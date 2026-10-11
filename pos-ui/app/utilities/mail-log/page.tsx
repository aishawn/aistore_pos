"use client";

import { useState } from "react";
import { AdminPageLayout, AdminSearchInput } from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { ViewIcon } from "@/components/icons";
import { AsyncState } from "@/components/admin/AsyncState";
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
  const { items, total, loading, error } = useApiList<MailLog>("/api/mail-log", {
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
      <AsyncState loading={loading} error={error} empty={items.length === 0}>
        <ListTable
          columns={[
            { label: "Date" },
            { label: "Recipient" },
            { label: "Subject" },
            { label: "Status", width: "w-[160px]" },
            { label: "Actions", align: "right", width: "w-[140px]" },
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
            <span key="a" className="flex items-center justify-end gap-1.5 font-medium text-[var(--oh-orange)]">
              <ViewIcon size={16} /> View
            </span>,
          ])}
        />
      </AsyncState>
      <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
    </AdminPageLayout>
  );
}
