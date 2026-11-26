export function transcriptionUatCasesForRuntime(cases, runtimeMatchesSource, worktreeDirty = false) {
  return runtimeMatchesSource && !worktreeDirty ? cases : [];
}

export function selectTranscriptionUatCases(cases, offset = 0, limit = 2) {
  if (!Number.isInteger(offset) || offset < 0) throw new RangeError("transcription case offset must be a nonnegative integer");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("transcription request limit must be between 1 and 100");
  return cases.slice(offset, offset + limit);
}
