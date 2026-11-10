export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { redirect } from "next/navigation";

export default function OdooRegisterRoute() {
  redirect("/register");
}
