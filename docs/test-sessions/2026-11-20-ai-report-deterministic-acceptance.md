# 2026-11-20 AI Report Deterministic Acceptance

## Change

The shared report acceptance helpers now require `source=deterministic` and `llmFallback=false` for sales, average sale, stock value, product count, and single-product stock checks. The failure case was added first and failed because the acceptance result had no deterministic-route assertion. After the helper and fixtures were updated, all 13 `orithos-report-assertions.test.mjs` tests passed.

The weekly sales runner now retains route source and fallback evidence in its report output.

## Online evidence

Demo and SKR were running frontend/backend SHA `89a461f491b4ea3053bfe4447dac5842f1626f67` during the checks. The exact-source weekly-sales runner passed 4/4 on each store for the complete Adelaide business week `2026-11-09` through `2026-11-15`; both Chinese and English answers reconciled with each store's native overview and reported deterministic routing, no LLM fallback, and no business writes.

The broader read-only report runner selected 14 checks per store, with 14 passing, zero failing, and zero business writes. Its nine assistant answers all passed the new deterministic-route assertions. Its overall status was `BLOCKED` because the local source revision had advanced to `2ad8bc138f466d326430c263ba1db2f82a356288` while the stores still ran `89a461f4`; do not treat that run as exact-SHA release acceptance.

## Remaining limits

These cases cover the selected sales, AOV, inventory value, product count, and stock questions; they do not cover the full utterance catalog. Dead-stock freshness remains `incomplete` because the combined inventory and sales query has no trusted source watermark. The doc-library GitHub workflow also remains blocked by ignored/untracked required documentation in clean checkout.
