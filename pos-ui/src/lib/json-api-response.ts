export async function readJsonApiResponse<T extends Record<string, unknown>>(
  response: Response,
  action: string,
): Promise<T> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const body = await response.text();
  if (!contentType.includes("/json") && !contentType.includes("+json")) {
    const format = body.trimStart().startsWith("<") ? "an HTML error page" : "a non-JSON response";
    const requestId = response.headers.get("x-correlation-id");
    throw new Error(`${action} returned ${format} (HTTP ${response.status})${requestId ? ` · Ref ${requestId}` : ""}. Retry, and contact support if it continues.`);
  }
  try {
    const payload: unknown = JSON.parse(body);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid JSON response");
    return payload as T;
  } catch {
    throw new Error(`${action} returned invalid JSON (HTTP ${response.status}). Retry, and contact support if it continues.`);
  }
}
