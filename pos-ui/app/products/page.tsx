import { OdooProductCataloguePage } from "@/components/OdooProductCataloguePage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function ProductsPage() {
  return <OdooProductCataloguePage />;
}
