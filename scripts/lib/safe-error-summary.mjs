export function safeErrorSummary(error) {
  return String(error instanceof Error ? error.message : "Unexpected failure")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\b(cookie|set-cookie|authorization|proxy-authorization)\s*:\s*[^\r\n]*/gi, "$1: [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[token redacted]")
    .split(/\r?\n/)
    .slice(0, 3)
    .join(" ")
    .slice(0, 500);
}
