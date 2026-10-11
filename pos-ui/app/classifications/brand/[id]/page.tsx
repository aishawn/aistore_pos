"use client";

import { useParams } from "next/navigation";
import { ClassificationViewPage } from "@/components/admin/ClassificationViewPage";

export default function BrandViewRoute() {
  const params = useParams();
  const id = params.id as string;
  return <ClassificationViewPage type="brand" id={id} />;
}
