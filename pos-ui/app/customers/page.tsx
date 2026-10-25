import { OdooCustomerDirectoryPage } from "@/components/OdooCustomerDirectoryPage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function CustomersPage() {
  return <OdooCustomerDirectoryPage />;
}
