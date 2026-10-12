"use client";

import { useParams } from "next/navigation";
import { EditSaleKeysPage } from "@/components/admin/EditSaleKeysPage";

export default function SaleKeysEditRoute() {
  const params = useParams();
  const id = params.id as string;
  return <EditSaleKeysPage setId={id} />;
}
