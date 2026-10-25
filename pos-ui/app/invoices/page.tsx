import { redirect } from "next/navigation";
export default function LegacyRoute() { redirect("/purchases?tab=invoices"); }
