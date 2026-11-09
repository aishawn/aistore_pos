import { SupplierDirectoryPage } from "@/components/OdooSupplierDirectoryPage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SuppliersPage() {
  return <SupplierDirectoryPage />;
}
