import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, backendUrl } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "content-type",
  "content-disposition",
  "if-match",
  "if-none-match",
  "range",
  "x-correlation-id",
  "x-shopfront-integration-token",
] as const;

const FORWARDED_RESPONSE_HEADERS = [
  "x-correlation-id",
  "accept-ranges",
  "cache-control",
  "content-disposition",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
] as const;

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const upstreamUrl = new URL(
    `/api/${path.map((part) => encodeURIComponent(part)).join("/")}`,
    backendUrl().replace(/\/+$/, "") + "/",
  );
  upstreamUrl.search = new URL(request.url).search;

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);

  // Shopfront is a service-token boundary and must not inherit a tenant Host.
  // Tenant-aware POS requests still forward the original host below.
  const isShopfrontIntegration = path[0] === "integrations" && path[1] === "shopfront";
  if (!isShopfrontIntegration) {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim()
      || request.headers.get("host");
    if (forwardedHost) headers.set("x-forwarded-host", forwardedHost);
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
    if (forwardedProto) headers.set("x-forwarded-proto", forwardedProto);
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  }

  const method = request.method.toUpperCase();
  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    const responseHeaders = new Headers();
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new NextResponse(method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      { code: 50200, message: "Backend service is unavailable", data: null },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
