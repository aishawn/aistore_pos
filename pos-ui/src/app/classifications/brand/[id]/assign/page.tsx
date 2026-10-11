"use client";

import { useParams } from "next/navigation";
import { AssignClassificationPage } from "@/components/admin/AssignClassificationPage";

export default function BrandAssignRoute() {
  const params = useParams();
  const id = params.id as string;
  return <AssignClassificationPage type="brand" id={id} />;
}
