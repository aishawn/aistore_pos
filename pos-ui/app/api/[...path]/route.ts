import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  applyRefreshedAccess,
  accessTokenNeedsRefresh,
  backendUrl,
  refreshAccessFromRequest,
  type RefreshedAccess,
} from "@/lib/server-auth";

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
  "idempotency-key",
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

function buildProxyHeaders(request: NextRequest, path: string[], authorization: string | null) {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (authorization) headers.set("authorization", authorization);

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
  return headers;
}

async function resolveAuthorization(
  request: NextRequest,
  clientAuthorization: string | null,
): Promise<{ authorization: string | null; refreshed: RefreshedAccess | null }> {
  if (clientAuthorization) return { authorization: clientAuthorization, refreshed: null };
  let accessToken = request.cookies.get(ACCESS_COOKIE)?.value ?? null;
  let refreshed: RefreshedAccess | null = null;
  if (!accessToken || accessTokenNeedsRefresh(accessToken)) {
    refreshed = await refreshAccessFromRequest(request);
    if (refreshed) accessToken = refreshed.accessToken;
  }
  return { authorization: accessToken ? `Bearer ${accessToken}` : null, refreshed };
}

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const upstreamUrl = new URL(
    `/api/${path.map((part) => encodeURIComponent(part).replace(/%3A/gi, ":")).join("/")}`,
    backendUrl().replace(/\/+$/, "") + "/",
  );
  upstreamUrl.search = new URL(request.url).search;

  const clientAuthorization = request.headers.get("authorization");
  let { authorization, refreshed } = await resolveAuthorization(request, clientAuthorization);

  const method = request.method.toUpperCase();
  const headers = buildProxyHeaders(request, path, authorization);
  const requestBody = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  try {
    let upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body: requestBody,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(BACKEND_PROXY_TIMEOUT_MS),
    });

    const canRefresh = !clientAuthorization && (method === "GET" || method === "HEAD");
    if (canRefresh && upstream.status === 401 && request.cookies.get(ACCESS_COOKIE)?.value) {
      const retryRefresh = await refreshAccessFromRequest(request);
      if (retryRefresh) {
        refreshed = retryRefresh;
        const retryHeaders = buildProxyHeaders(request, path, `Bearer ${retryRefresh.accessToken}`);
        upstream = await fetch(upstreamUrl, {
          method,
          headers: retryHeaders,
          body: requestBody,
          cache: "no-store",
          redirect: "manual",
          signal: AbortSignal.timeout(BACKEND_PROXY_TIMEOUT_MS),
        });
      }
    }

    const responseHeaders = new Headers();
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    const response = new NextResponse(method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
    if (refreshed) applyRefreshedAccess(response, refreshed);
    return response;
  } catch {
    const unavailable = NextResponse.json(
      { code: 50200, message: "Backend service is unavailable", data: null },
      { status: 502 },
    );
    if (refreshed) applyRefreshedAccess(unavailable, refreshed);
    return unavailable;
  }
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
