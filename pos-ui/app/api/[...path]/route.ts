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

const BACKEND_PROXY_TIMEOUT_MS = (() => {
  const configured = Number(process.env.BACKEND_PROXY_TIMEOUT_MS ?? "60000");
  return Number.isFinite(configured) ? Math.min(120_000, Math.max(5_000, configured)) : 60_000;
})();

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const upstreamUrl = new URL(
    `/api/${path.map((part) => encodeURIComponent(part).replace(/%3A/gi, ":")).join("/")}`,
    backendUrl().replace(/\/+$/, "") + "/",
  );
  upstreamUrl.search = new URL(request.url).search;

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Preserve machine-to-machine API tokens. Browser requests do not expose
  // the HttpOnly access token, so fall back to the session cookie only when
  // the caller did not supply an Authorization header.
  const clientAuthorization = request.headers.get("authorization");
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (clientAuthorization) headers.set("authorization", clientAuthorization);
  else if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);

  // Shopfront is a service-token boundary and must not inherit a tenant Host.
  // Tenant-aware POS requests still forward the original host below.
  const isShopfrontIntegration = path[0] === "integrations" && path[1] === "shopfront";
  if (!isShopfrontIntegration) {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim()
      || request.headers.get("host");
    if (forwardedHost) headers.set("x-forwarded-host", forwardedHost);
    const tenantSlug = request.headers.get("x-orithos-tenant-slug")
      || forwardedHost?.match(/^([a-z0-9-]+)\.orithos\.com\.au(?::\d+)?$/i)?.[1];
    if (tenantSlug) headers.set("x-orithos-tenant-slug", tenantSlug);
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
      signal: AbortSignal.timeout(BACKEND_PROXY_TIMEOUT_MS),
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
