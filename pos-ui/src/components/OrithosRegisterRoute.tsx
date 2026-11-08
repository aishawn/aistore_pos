import { headers } from "next/headers";
import { OdooRegisterPage } from "@/components/OdooRegisterPage";
import { OrithosRegisterPage } from "@/components/OrithosRegisterPage";

export async function OrithosRegisterRoute() {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"))
    ?.split(",", 1)[0]?.split(":", 1)[0]?.trim().toLowerCase();
  return host === "demo.orithos.com.au" ? <OrithosRegisterPage /> : <OdooRegisterPage />;
}
