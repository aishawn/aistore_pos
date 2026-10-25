"use client";
import Link from "next/link";
import { useGiftCardCapability } from "@/hooks/useGiftCardCapability";
import { OdooRecordLink } from "@/components/OdooRecordLink";

export function GiftCardCapabilityCard() {
  const capability = useGiftCardCapability();
  return <section className="rounded-xl border border-[var(--oh-border)] bg-white p-5"><h2 className="font-semibold">Gift cards</h2>
    {!capability.permitted ? <p className="mt-2 text-sm">Gift card access permission is required to check availability.</p> : <>
      <p role={capability.error ? "alert" : "status"} className="my-3 text-sm">{(capability.loading || (capability.available === null && !capability.error)) ? "Checking availability…" : capability.error || (capability.available ? "Gift card queries are available. Issue and redeem cards in Odoo." : "Gift cards are not enabled. In Odoo Apps, install Coupons & Loyalty and Point of Sale - Coupons & Loyalty, then configure a Gift Card program.")}</p>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={capability.loading} onClick={capability.refresh} className="min-h-11 rounded border px-3">Retry availability</button>{capability.available && <Link href="/giftcards" className="inline-flex min-h-11 items-center rounded border px-3">View gift cards</Link>}<OdooRecordLink model="loyalty.program">Open Odoo plans</OdooRecordLink></div>
    </>}
  </section>;
}
