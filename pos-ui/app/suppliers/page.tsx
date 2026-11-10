import { SupplierDirectoryPage } from "@/components/OdooSupplierDirectoryPage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Owner-locked shell: supplier directory with search/create. Do not swap to Native* without explicit owner approval. */
export default function SuppliersPage() {
  return <SupplierDirectoryPage />;
}
