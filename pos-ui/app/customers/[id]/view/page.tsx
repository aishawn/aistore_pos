"use client";

"use client";

import { useParams } from "next/navigation";
import { CustomerViewPage } from "@/components/admin/CustomerViewPage";

export default function CustomerViewRoute() {
  const params = useParams<{ id: string }>();
  return <CustomerViewPage customerId={params.id} />;
}
