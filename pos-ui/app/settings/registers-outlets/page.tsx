"use client";

import {
  AdminPageLayout,
  AdminPrimaryButton,
  AdminRowActions,
} from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { PlusIcon, StoreIcon, RegisterIcon } from "@/components/icons";

export default function RegistersOutletsPage() {
  return (
    <AdminPageLayout
      title="Registers & Outlets"
      subtitle="Manage store locations and POS registers"
      fullBleed
    >
      <div className="mb-4 rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] md:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-[var(--oh-text)]">
            <StoreIcon size={18} /> Outlets
          </h2>
          <AdminPrimaryButton>
            <PlusIcon size={16} /> New Outlet
          </AdminPrimaryButton>
        </div>
        <ListTable
          columns={[
            { label: "Outlet" },
            { label: "Address" },
            { label: "Actions", align: "center", width: "w-[200px]" },
          ]}
          rows={[
            ["Main Outlet", "11 Example St, Sydney NSW", <AdminRowActions key="a" />],
            ["City Store", "200 George St, Sydney NSW", <AdminRowActions key="b" />],
          ]}
        />
      </div>

      <div className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] md:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-[var(--oh-text)]">
            <RegisterIcon size={18} /> Registers
          </h2>
          <AdminPrimaryButton>
            <PlusIcon size={16} /> New Register
          </AdminPrimaryButton>
        </div>
        <ListTable
          columns={[
            { label: "Register" },
            { label: "Outlet" },
            { label: "Actions", align: "center", width: "w-[200px]" },
          ]}
          rows={[
            ["Register #1", "Main Outlet", <AdminRowActions key="a" />],
            ["Register #2", "City Store", <AdminRowActions key="b" />],
          ]}
        />
      </div>
    </AdminPageLayout>
  );
}
