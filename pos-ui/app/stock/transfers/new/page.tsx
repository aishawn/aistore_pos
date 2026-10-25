import { redirect } from "next/navigation";

export default function NewTransferRedirect() {
  redirect("/purchases?tab=transfer-new");
}
