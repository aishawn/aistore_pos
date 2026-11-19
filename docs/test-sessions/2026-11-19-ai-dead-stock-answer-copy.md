# POS AI dead-stock answer copy regression

## Scope

Fixed the Chinese dead-stock answer wording after the prior live sample exposed awkward date-range phrasing and an English empty-result response. This change is limited to deterministic response formatting; it does not change report calculations, data completeness, routing, or business behavior.

## Evidence

- Source change: `e58b6bc6` (`fix(ai): localize dead-stock report responses`); the change is included in the current `main` history.
- Local Java 21 focused regression: `ReportRespondNodeTest`, 35/35 passed.
- `git diff --check`: passed.
- Demo and SKR read-only online checks: Chinese and English prompts routed to deterministic `report_dead_stock`; no model fallback and no POS business write requests. Chinese date ranges use `至`, and empty-result wording is Chinese.
- The answer retains the warning that sales freshness and completeness cannot be confirmed. The result remains `incomplete`.

## Limitations and follow-up

This verifies response language and routing, not the truth or completeness of the dead-stock list. The source currently provides no trusted report `dataAsOf` for this combined inventory and sales query, so freshness acceptance remains `BLOCKED`; do not infer freshness from query time or inventory timestamps alone. Resolve this only when an authoritative sales/source watermark is available, then add a regression and repeat the read-only Demo/SKR comparison.

No model calls, deployment action, or POS business writes were performed as part of the local regression. The online checks create normal assistant audit/session records.

## Empty-result status correction

The follow-up audit found that generic report logic marked an empty dead-stock result `no_data` before checking the missing freshness timestamp. That could produce a definitive “no dead-stock items” answer despite the unresolved freshness gap. Added a regression that first failed with `expected: incomplete, was: no_data`, then required empty dead-stock results without `dataAsOf` to remain `incomplete`. The response regression now requires the Chinese answer to say that absence cannot be confirmed and that the result needs verification.

Java 21 focused verification after the correction: `NativeReportQueryNodeTest` 11/11 and `ReportRespondNodeTest` 35/35 PASS (46/46 total). No timestamp was synthesized; the status remains `incomplete` until an authoritative source watermark is available.

## Deployment identity

Fix commit `66de47da8054443981f65854810ead97d3929410` is on `main`. Public `/api/public/version` checks confirmed both Demo and SKR frontend and backend report this exact SHA. Authenticated post-deploy assistant acceptance was NOT RUN: no assistant login credential was available in the current process, and browser automation could not verify the existing browser URL as allowed. Runtime identity is verified; online behavior for this specific empty-result correction remains pending.
