"use client";

import { useParams } from "next/navigation";
import { CreateCustomerPage } from "@/components/admin/CreateCustomerPage";

export default function CustomerEditRoute() {
  const params = useParams();
  const id = params.id as string;
  return <CreateCustomerPage customerId={id} />;
}
