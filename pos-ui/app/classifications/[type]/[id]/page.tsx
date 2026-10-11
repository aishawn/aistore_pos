"use client";

import { useParams } from "next/navigation";
import { ClassificationViewPage } from "@/components/admin/ClassificationViewPage";

const VALID_TYPES = new Set(["brand", "category", "family", "tag"]);

export default function ClassificationViewRoute() {
  const params = useParams();
  const type = params.type as string;
  const id = params.id as string;

  if (!VALID_TYPES.has(type)) {
    return <div className="p-4 text-[14px] text-[var(--oh-danger)]">Unknown classification type.</div>;
  }

  return <ClassificationViewPage type={type} id={id} />;
}
