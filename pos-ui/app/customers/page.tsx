import { OdooCustomerDirectoryPage } from "@/components/OdooCustomerDirectoryPage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Owner-locked shell: full customer directory. Do not swap to Native* without explicit owner approval. */
export default function CustomersPage() {
  return <OdooCustomerDirectoryPage />;
}
