export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { redirect } from "next/navigation";

export default function OdooSupplierDirectoryRoute(): never {
  redirect("/suppliers");
}
