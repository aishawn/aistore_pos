// Generates Next.js App Router stub pages for every Orithos menu route.
// Stubs render <PageScaffold title="..."/> so drawer navigation works before
// each page is replaced by its full pixel-perfect clone.
// Usage: node scripts/gen-routes.mjs
import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";

const ROUTES = [
  ["Dashboard", "/dashboard"],
  ["Manage Cash", "/manage-cash"],
  ["Close Register", "/close"],
  ["Sales History", "/history"],
  ["Products", "/products"],
  ["Classifications", "/classifications"],
  ["Suppliers", "/suppliers"],
  ["Orders & Invoices", "/orders"],
  ["Stocktake", "/stocktake"],
  ["More", "/stock/more"],
  ["Customers", "/customers"],
  ["Customer Groups", "/customer-groups"],
  ["Price Lists", "/pricelists"],
  ["Balances", "/customers/balances"],
  ["Gift Cards", "/giftcards"],
  ["Promotions", "/promotions"],
  ["Shelf Tickets", "/tickets"],
  ["Media Centre", "/media"],
  ["Reporting Dashboard", "/reports/dashboard"],
  ["Security Centre", "/security"],
  ["Sales Reports", "/reports/sales"],
  ["Inventory Reports", "/reports/inventory"],
  ["Purchase Reports", "/reports/purchase"],
  ["Transfer Reports", "/reports/transfer"],
  ["Actions Reports", "/reports/actions"],
  ["Advanced Reports", "/reports/advanced"],
  ["Favourite Reports", "/reports/favourites"],
  ["Miscellaneous Reports", "/reports/misc"],
  ["Register Closures", "/reports/closures"],
  ["General", "/settings"],
  ["Account & Billing", "/settings/account"],
  ["Sale Keys", "/settings/keys"],
  ["Receipts", "/settings/receipts"],
  ["Statements", "/settings/statements"],
  ["Payment Methods", "/settings/payment"],
  ["Tax Rates", "/settings/tax"],
  ["Transfer List", "/settings/transferees"],
  ["Customer Display", "/settings/customerdisplay"],
  ["Users", "/settings/users"],
  ["Roles & Permissions", "/settings/roles"],
  ["Loyalty", "/settings/loyalty"],
  ["Surcharging", "/settings/surcharging"],
  ["Hardware", "/settings/hardware"],
  ["Additional Information", "/settings/additional-information"],
  ["Page Rules", "/settings/rules"],
  ["Integrations", "/settings/integrations"],
  ["Push Notifications", "/settings/push"],
  ["Promotion Categories", "/promotion/categories"],
  ["Barcode Templates", "/settings/barcodes"],
  ["Price Sets", "/settings/pricesets"],
  ["Registers & Outlets", "/settings/registers-outlets"],
  ["Enterprise Policies", "/enterprise"],
  ["Future Prices", "/utilities/future-prices"],
  ["Future Costs", "/utilities/future-costs"],
  ["Mail Log", "/utilities/mail-log"],
  ["Vendor Connections", "/utilities/vendor-connections"],
  ["Trashed Items", "/utilities/trashed-items"],
  ["Barcodes", "/utilities/barcodes"],
  ["Product Utilities", "/utilities/products"],
  ["Customer Utilities", "/utilities/customers"],
];

const appDir = new URL("../src/app", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

let created = 0;
let skipped = 0;
for (const [label, route] of ROUTES) {
  const fileDir = join(appDir, route.replace(/^\//, ""));
  const filePath = join(fileDir, "page.tsx");
  try {
    await access(filePath);
    skipped++;
    continue; // never clobber an already-built page
  } catch {
    // doesn't exist — create it
  }
  await mkdir(dirname(filePath), { recursive: true });
  const content = `import { PageScaffold } from "@/components/PageScaffold";

export default function Page() {
  return <PageScaffold title=${JSON.stringify(label)} />;
}
`;
  await writeFile(filePath, content, "utf8");
  created++;
}

console.log(`gen-routes: created ${created}, skipped ${skipped} (already existed).`);
