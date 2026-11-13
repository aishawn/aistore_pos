const ACCESS_COOKIE = "orithos_access_token";
const STORE_KEY = "skr";

function crawlerBaseUrl() {
  return (process.env.SHOPFRONT_CRAWLER_BASE_URL || "https://crawler.orithos.com.au").replace(/\/+$/, "");
}

type UserInfo = { isAdmin?: boolean; permissions?: string[] };

type AuthorizedRequest = {
  accessToken: string;
};

function response(
  body: { code: number; message: string; data: unknown },
  status: number,
) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function failure(message: string, status: number) {
  return response({ code: status * 100, message, data: null }, status);
}

function cookie(request: Request, name: string) {
  const pair = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : undefined;
}

function requestBackendUrl() {
  return (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
}

function isSameOrigin(request: Request) {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return true;
  try {
    const origin = new URL(originHeader).origin;
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
    const host = forwardedHost || request.headers.get("host") || requestUrl.host;
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
    const protocol = forwardedProto || requestUrl.protocol.slice(0, -1);
    return origin === `${protocol}://${host}` || origin === requestUrl.origin;
  } catch {
    return false;
  }
}

async function authorize(request: Request): Promise<AuthorizedRequest | Response> {
  if (!isSameOrigin(request)) return failure("Cross-origin request is not allowed", 403);

  const accessToken = cookie(request, ACCESS_COOKIE);
  if (!accessToken) return failure("Your session has expired. Please sign in again.", 401);

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim()
    || request.headers.get("host");
  const tenantSlug = request.headers.get("x-orithos-tenant-slug")
    || forwardedHost?.match(/^([a-z0-9-]+)\.orithos\.com\.au(?::\d+)?$/i)?.[1];
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (forwardedHost) headers["X-Forwarded-Host"] = forwardedHost;
  if (tenantSlug) headers["X-Orithos-Tenant-Slug"] = tenantSlug;

  try {
    const userResponse = await fetch(`${requestBackendUrl()}/api/auth/me`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const payload = await userResponse.json() as { code?: number; data?: UserInfo };
    if (!userResponse.ok || payload.code !== 0 || !payload.data) {
      return failure("Unable to verify the current Orithos session", 401);
    }
    const user = payload.data;
    if (!user.isAdmin && !user.permissions?.includes("settings.integrations")) {
      return failure("Settings integrations permission is required", 403);
    }
    return { accessToken };
  } catch {
    return failure("Unable to verify the current Orithos session", 502);
  }
}

async function crawlerRequest(path: string, method: "GET" | "POST") {
  const token = process.env.SHOPFRONT_INTEGRATION_TOKEN?.trim();
  if (!token) return { status: 503, payload: null };

  try {
    const upstream = await fetch(`${crawlerBaseUrl()}${path}`, {
      method,
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await upstream.json().catch(() => null) as Record<string, unknown> | null;
    return { status: upstream.status, payload };
  } catch {
    return { status: 502, payload: null };
  }
}

export async function triggerSettingsImport(request: Request) {
  const auth = await authorize(request);
  if (auth instanceof Response) return auth;

  let storeKey = STORE_KEY;
  try {
    const body = await request.json() as { storeKey?: unknown };
    if (body.storeKey !== undefined && body.storeKey !== STORE_KEY) {
      return failure("Only the configured source store can be imported", 400);
    }
    if (body.storeKey) storeKey = String(body.storeKey);
  } catch {
    return failure("Invalid settings import request", 400);
  }

  const result = await crawlerRequest(`/api/stores/${storeKey}/settings/import`, "POST");
  if (result.status < 200 || result.status >= 300 || !result.payload) {
    const status = result.status === 409 ? 409 : result.status === 503 ? 503 : 502;
    const message = status === 409
      ? "A crawler sync is already active for this store"
      : status === 503
        ? "Store import integration is not configured"
        : "Settings import could not be started";
    return failure(message, status);
  }

  return response({ code: 0, message: "Settings import queued", data: result.payload }, 200);
}

export async function readSettingsImportStatus(request: Request) {
  const auth = await authorize(request);
  if (auth instanceof Response) return auth;

  const result = await crawlerRequest(`/api/sync/status?store=${STORE_KEY}`, "GET");
  if (result.status < 200 || result.status >= 300 || !result.payload) {
    return failure("Settings import status is unavailable", 502);
  }

  const rows = Array.isArray(result.payload.data) ? result.payload.data : [];
  const job = rows.find((row) => row && typeof row === "object"
    && (row as Record<string, unknown>).type === "settings_import") as Record<string, unknown> | undefined;
  const data = job ? {
    job_id: job.id,
    status: job.status,
    phase: job.phase,
    started_at: job.started_at,
    finished_at: job.finished_at,
  } : null;
  return response({ code: 0, message: "OK", data }, 200);
}
