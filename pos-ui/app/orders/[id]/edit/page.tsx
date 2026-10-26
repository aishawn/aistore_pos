"use client";

import { useParams } from "next/navigation";
import { EditOrderPage } from "@/components/admin/EditOrderPage";

export default function OrderEditRoute() {
  const params = useParams();
  return <EditOrderPage orderId={params.id as string} />;
}
