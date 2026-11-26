export function transcriptionUatCasesForRuntime(cases, runtimeMatchesSource, worktreeDirty = false) {
  return runtimeMatchesSource && !worktreeDirty ? cases : [];
}
