"use client";

import {
  AdminPageLayout,
  AdminPrimaryButton,
  AdminRowActions,
} from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { PlusIcon } from "@/components/icons";

const ENTRIES = [
  ["Main Warehouse", "Outlet"],
  ["City Store", "Outlet"],
  ["Airport Kiosk", "Outlet"],
];

export default function TransferListPage() {
  return (
    <AdminPageLayout
      title="Transfer List"
      subtitle="Locations available for stock transfers"
      count={ENTRIES.length}
      countLabel="Locations"
      actions={
        <AdminPrimaryButton>
          <PlusIcon size={16} /> New
        </AdminPrimaryButton>
      }
    >
      <ListTable
        columns={[
          { label: "Name" },
          { label: "Type" },
          { label: "Actions", align: "center", width: "w-[200px]" },
        ]}
        rows={ENTRIES.map(([n, t]) => [n, t, <AdminRowActions key="a" />])}
      />
    </AdminPageLayout>
  );
}
