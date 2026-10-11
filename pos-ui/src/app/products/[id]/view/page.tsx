"use client";

import { useParams } from "next/navigation";
import { ProductViewPage } from "@/components/admin/ProductViewPage";

export default function ProductViewRoute() {
  const params = useParams();
  const id = params.id as string;
  return <ProductViewPage productId={id} />;
}
