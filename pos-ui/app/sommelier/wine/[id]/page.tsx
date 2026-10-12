import { SommelierWinePage } from "@/components/sommelier/SommelierWinePage";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SommelierWinePage productId={id} />;
}
