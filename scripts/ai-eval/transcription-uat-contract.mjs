export function transcriptionUatCasesForRuntime(cases, runtimeMatchesSource, worktreeDirty = false) {
  return runtimeMatchesSource && !worktreeDirty ? cases : [];
}

export function transcriptionRequestShouldStop(apiCode) {
  return apiCode === 42901;
}

export function selectTranscriptionUatCases(cases, offset = 0, limit = 2) {
  if (!Number.isInteger(offset) || offset < 0) throw new RangeError("transcription case offset must be a nonnegative integer");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("transcription request limit must be between 1 and 100");
  return cases.slice(offset, offset + limit);
}

export function summarizeTranscriptionUatResults(results) {
  const groups = new Map();
  for (const result of results) {
    const key = `${result.language}:${result.scenario}`;
    const group = groups.get(key) ?? {
      language: result.language,
      scenario: result.scenario,
      requested: 0,
      passed: 0,
      failed: 0,
      blocked: 0,
      latencies: [],
    };
    group.requested++;
    group[result.status === "PASS" ? "passed" : result.status === "FAIL" ? "failed" : "blocked"]++;
    if (Number.isFinite(result.latencyMs)) group.latencies.push(result.latencyMs);
    groups.set(key, group);
  }

  return [...groups.values()].map(({ latencies, ...group }) => {
    const sorted = [...latencies].sort((left, right) => left - right);
    const percentile = (fraction) => sorted.length
      ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
      : null;
    return {
      ...group,
      errorRate: group.requested ? (group.failed + group.blocked) / group.requested : null,
      latencyMs: {
        samples: sorted.length,
        p50: percentile(0.5),
        p95: percentile(0.95),
      },
    };
  }).sort((left, right) => left.language.localeCompare(right.language) || left.scenario.localeCompare(right.scenario));
}
