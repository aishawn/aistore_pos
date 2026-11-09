import { headers } from "next/headers";
import { OdooRegisterPage } from "@/components/OdooRegisterPage";
import { OrithosRegisterPage } from "@/components/OrithosRegisterPage";
import { isNativePosHost } from "@/lib/native-pos-host";

export async function OrithosRegisterRoute() {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"))
    ?.split(",", 1)[0]?.split(":", 1)[0]?.trim().toLowerCase();
  return host && isNativePosHost(host) ? <OrithosRegisterPage /> : <OdooRegisterPage />;
}
