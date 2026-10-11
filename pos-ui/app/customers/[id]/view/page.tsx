"use client";

import { useParams } from "next/navigation";
import { CustomerViewPage } from "@/components/admin/CustomerViewPage";

export default function CustomerViewRoute() {
  const params = useParams();
  const id = params.id as string;
  return <CustomerViewPage customerId={id} />;
}
