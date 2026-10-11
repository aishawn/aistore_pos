"use client";

import { useParams } from "next/navigation";
import { EditProductPage } from "@/components/admin/EditProductPage";

export default function ProductEditRoute() {
  const params = useParams();
  const id = params.id as string;
  return <EditProductPage productId={id} />;
}
