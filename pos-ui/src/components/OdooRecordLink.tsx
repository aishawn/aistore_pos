"use client";

import Link from "next/link";

function recordHref(model: string, id?: number) {
  if (model === "loyalty.program" || model.includes("gift")) return "/giftcards";
  if (model === "res.partner" || model === "account.move" || model.includes("customer")) {
    return id ? `/customers/${id}` : "/customers";
  }
  return id ? `/customers/${id}` : "/customers";
}

export function OdooRecordLink({ model, id, children }: { model: string; id?: number; children: React.ReactNode }) {
  const href = recordHref(model, id);
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-primary)]"
    >
      {children}
    </Link>
  );
}
