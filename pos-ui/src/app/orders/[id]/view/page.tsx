"use client";

import { useParams } from "next/navigation";
import { OrderViewPage } from "@/components/admin/OrderViewPage";

export default function OrderViewRoute() {
  const params = useParams();
  const id = params.id as string;
  return <OrderViewPage orderId={id} />;
}
