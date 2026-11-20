export function runtimeMatchesSource(body, sourceCommit) {
  const data = body?.data ?? body ?? {};
  const frontendCommit = data.frontend?.commit ?? data.frontendCommit ?? data.frontendSha ?? null;
  const backendCommit = data.backend?.commit ?? data.backendCommit ?? data.backendSha ?? null;
  return Boolean(sourceCommit && frontendCommit === sourceCommit && backendCommit === sourceCommit);
}

export function stockClarificationAcceptance(data = {}, {
  responseOk = false,
  code,
  answerIncludes,
  answerCheck,
  namedUnknown = false,
} = {}) {
  const answer = typeof data.answer === "string" ? data.answer : "";
  const checks = {
    response: responseOk && code === 0,
    intent: data.intent === (namedUnknown ? "report_stock" : "qa"),
    noRoute: data.ui?.route == null || data.ui.route === "",
    answer: namedUnknown || (typeof answerCheck === "boolean"
      ? answerCheck
      : typeof answerIncludes === "string" && answer.includes(answerIncludes)),
    deterministicNoFallback: data.source === "deterministic" && data.llmFallback === false,
    noWrites: Array.isArray(data.writeRequests) && data.writeRequests.length === 0,
  };
  return { checks, passed: Object.values(checks).every(Boolean) };
}
