import { AiReportResultPage } from "@/components/admin/AiReportResultPage";

export const dynamic = "force-dynamic";

export default async function AiReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AiReportResultPage key={id} reportId={id} />;
}
