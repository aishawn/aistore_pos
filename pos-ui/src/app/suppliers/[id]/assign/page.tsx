"use client";

import { useParams } from "next/navigation";
import { AssignSupplierPage } from "@/components/admin/AssignSupplierPage";

export default function SupplierAssignRoute() {
  const params = useParams();
  const id = params.id as string;
  return <AssignSupplierPage id={id} />;
}
