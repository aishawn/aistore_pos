export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { OdooPriceSuggestionsPage } from "@/components/OdooPriceSuggestionsPage";

export default function PriceSuggestionsRoute() {
  return (
    <>
      <aside className="mx-auto mt-3 max-w-7xl border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-950 sm:mt-4 sm:px-6">
        Inputs: current Orithos shelf price, recorded cost, tax rate and units sold in the last 28 days. This is a target-margin review, not a historical realised-price analysis or competitor benchmark. Source timestamps for these inputs are unavailable here.
      </aside>
      <OdooPriceSuggestionsPage />
    </>
  );
}
