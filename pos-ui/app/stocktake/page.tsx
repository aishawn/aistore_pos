import { redirect } from "next/navigation";

/** Classic MySQL stocktake list → Odoo stocktake. */
export default function ClassicStocktakeRedirect() {
  redirect("/stock/stocktake");
}
