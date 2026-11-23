const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;

export function hasNewFrontendBuild(currentCommit: unknown, latestCommit: unknown): boolean {
  if (typeof currentCommit !== "string" || typeof latestCommit !== "string") return false;
  const current = currentCommit.trim();
  const latest = latestCommit.trim();
  return COMMIT_PATTERN.test(current) && COMMIT_PATTERN.test(latest)
    && current.toLowerCase() !== latest.toLowerCase();
}
