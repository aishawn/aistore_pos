import FutureCostsClientPage from "./client-page";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default function FutureCostsPage() {
  return <FutureCostsClientPage />;
}
