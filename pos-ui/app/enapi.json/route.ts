const backendUrl = process.env.BACKEND_URL || "http://backend:8080";

export const dynamic = "force-dynamic";

export async function GET() {
  const upstream = await fetch(`${backendUrl}/api/openapi.json`, { cache: "no-store" });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": upstream.headers.get("content-type") || "application/json",
    },
  });
}
