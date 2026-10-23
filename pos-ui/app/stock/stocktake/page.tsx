import { redirect } from "next/navigation";

/** Stocktake lives under Products — keep this path for old/AI links. */
export default function StocktakeRedirect() {
  redirect("/products/odoo?tab=stocktake");
}
