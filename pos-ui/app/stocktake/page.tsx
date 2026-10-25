import { redirect } from "next/navigation";

/** Classic MySQL stocktake list → Orithos stocktake. */
export default function ClassicStocktakeRedirect() {
  redirect("/stock/stocktake");
}
