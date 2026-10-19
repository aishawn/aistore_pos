"use client";

import { useState } from "react";
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
  const { items, total, loading, error, reload } = useApiList<MailLog>("/api/mail-log", {
    recipient: dq || undefined,
    page,
    size: PAGE_SIZE,
  });

  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <h1 className="text-[34px] font-bold text-black">Mail Log</h1>

      <input
        aria-label="Search mail by recipient"
        value={recipient}
        onChange={(e) => {
          setRecipient(e.target.value);
          setPage(1);
        }}
        placeholder="Search mail..."
        className="mt-4 h-[52px] w-full rounded-xl border-2 border-black px-4 text-[16px] outline-none placeholder:text-neutral-400"
      />

      <div className="mt-6">
          <AsyncState loading={loading} error={error} empty={items.length === 0} onRetry={reload}>
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
              <span key="st" className={m.status === "Bounced" || m.status === "BOUNCED" ? "text-[#e2231a]" : "text-[#3cb44b]"}>{m.status ?? ""}</span>,
              <span key="a" className="flex items-center justify-end gap-1.5 font-semibold text-[var(--sf-tab-blue)]"><ViewIcon size={18} /> View</span>,
            ])}
          />
        </AsyncState>
        <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
      </div>
    </div>
  );
}
