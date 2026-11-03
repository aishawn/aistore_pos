import { NextRequest } from "next/server";
import { serveReport } from "@/lib/report-request";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return serveReport(request, true); }
