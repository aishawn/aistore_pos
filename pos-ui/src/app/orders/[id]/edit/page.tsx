"use client";

import { useParams } from "next/navigation";
import { EditOrderPage } from "@/components/admin/EditOrderPage";

export default function OrderEditRoute() {
  const params = useParams();
  const id = params.id as string;
  return <EditOrderPage orderId={id} />;
}
