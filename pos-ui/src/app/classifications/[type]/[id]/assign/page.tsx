"use client";

import { useParams } from "next/navigation";
import { AssignClassificationPage } from "@/components/admin/AssignClassificationPage";

const VALID_TYPES = new Set(["brand", "category", "family", "tag"]);

export default function ClassificationAssignRoute() {
  const params = useParams();
  const type = params.type as string;
  const id = params.id as string;

  if (!VALID_TYPES.has(type)) {
    return <div className="p-4 text-[14px] text-[var(--oh-danger)]">Unknown classification type.</div>;
  }

  return <AssignClassificationPage type={type} id={id} />;
}
