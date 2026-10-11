"use client";

import { useParams } from "next/navigation";
import { CustomerMakePaymentPage } from "@/components/admin/CustomerMakePaymentPage";

export default function CustomerMakePaymentRoute() {
  const params = useParams();
  const id = params.id as string;
  return <CustomerMakePaymentPage customerId={id} />;
}
