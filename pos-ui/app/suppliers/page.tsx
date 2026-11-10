import { NativeSupplierDirectoryPage } from "@/components/NativeSupplierDirectoryPage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SuppliersPage() {
  return <NativeSupplierDirectoryPage />;
}
