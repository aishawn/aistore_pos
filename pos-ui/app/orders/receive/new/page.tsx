import { redirect } from "next/navigation";

export default function NewReceiveStockRoute() {
  // Receiving is line based now. The purchase order detail page owns the
  // quantity and idempotency workflow, so this legacy invoice-header route
  // must not expose a form that can submit an empty receipt.
  redirect("/orders");
}
