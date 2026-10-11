"use client";

import { useParams } from "next/navigation";
import { CustomerGroupViewPage } from "@/components/admin/CustomerGroupViewPage";

export default function CustomerGroupViewRoute() {
  const params = useParams();
  const id = params.id as string;
  return <CustomerGroupViewPage groupId={id} />;
}
