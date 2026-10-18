import FuturePricesClientPage from "./client-page";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default function FuturePricesPage() {
  return <FuturePricesClientPage />;
}
