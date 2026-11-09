import { headers } from "next/headers";
import { OdooCloseRegisterPage } from "@/components/OdooCloseRegisterPage";
import { OrithosCloseRegisterPage } from "@/components/OrithosCloseRegisterPage";
import { isNativePosHost } from "@/lib/native-pos-host";

export async function OrithosCloseRegisterRoute() {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"))
    ?.split(",", 1)[0]?.split(":", 1)[0]?.trim().toLowerCase();
  return host && isNativePosHost(host) ? <OrithosCloseRegisterPage /> : <OdooCloseRegisterPage />;
}
