import { NativeCustomerDirectoryPage } from "@/components/NativeCustomerDirectoryPage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function CustomersPage() {
  return <NativeCustomerDirectoryPage />;
}
