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
