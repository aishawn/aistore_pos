import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { CardHub } from "@/components/admin/CardHub";
import {
  ClipboardIcon, ScanIcon, FunnelIcon, EditIcon, WarehouseIcon, DollarIcon,
} from "@/components/icons";

export default function StockMorePage() {
  return (
    <AdminPageLayout title="Stock Management" fullBleed>
      <CardHub
        cards={[
          { title: "Stock List", description: "An exportable list of product's cost, inventory and prices", Icon: ClipboardIcon, href: "/stock/list" },
          { title: "External Stocktake", description: "Import and Export files to use with an external stocktaker or stocktaking program", Icon: ScanIcon, href: "/stock/external-stocktake" },
          { title: "Price Suggestions", description: "Rule-based shelf price suggestions from cost and margin target — you apply changes", Icon: DollarIcon, href: "/stock/price-suggestions" },
          { title: "Capped Pricing", description: "Compare your prices with a list of maximum shelf prices", Icon: FunnelIcon, href: "/stock/capped-pricing" },
          { title: "Bulk Price Edit", description: "Edit multiple product's prices at once", Icon: EditIcon, href: "/stock/bulk-price-edit" },
          { title: "Import Supplier Products", description: "Import a list of products from their supplier codes", Icon: WarehouseIcon, href: "/stock/import-supplier-products" },
          { title: "Product Buying Periods", description: "View and edit the buying periods for products", Icon: DollarIcon, href: "/stock/buying-periods" },
        ]}
      />
    </AdminPageLayout>
  );
}
