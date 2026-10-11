"use client";

import { useParams } from "next/navigation";
import { CreateSupplierPage } from "@/components/admin/CreateSupplierPage";

export default function SupplierEditRoute() {
  const params = useParams();
  const id = params.id as string;
  return <CreateSupplierPage supplierId={id} />;
}
