"use client";

import { Suspense } from "react";
import { CustomerStatementsViewPage } from "@/components/admin/CustomerStatementsViewPage";

export default function Page() {
  return (
    <Suspense>
      <CustomerStatementsViewPage />
    </Suspense>
  );
}
