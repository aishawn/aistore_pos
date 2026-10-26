"use client";

import { useParams } from "next/navigation";
import { OrderViewPage } from "@/components/admin/OrderViewPage";

export default function OrderViewRoute() {
  const params = useParams();
  return <OrderViewPage orderId={params.id as string} />;
}
