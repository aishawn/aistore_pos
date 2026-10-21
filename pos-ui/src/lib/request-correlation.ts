const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function withRequestCorrelation(headers: HeadersInit, request: Pick<Request, "headers">): Headers {
  const result = new Headers(headers);
  const correlationId = request.headers.get("x-correlation-id");
  if (correlationId && UUID_PATTERN.test(correlationId)) result.set("X-Correlation-ID", correlationId);
  return result;
}
