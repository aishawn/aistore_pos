"use client";

import { useParams } from "next/navigation";
import { EditCustomerGroupPage } from "@/components/admin/EditCustomerGroupPage";

export default function CustomerGroupEditRoute() {
  const params = useParams();
  const id = params.id as string;
  return <EditCustomerGroupPage groupId={id} />;
}
