# 2026-11-18 AI Gross-Profit Tax Basis

## Finding

Demo runtime/source SHA `228166e8ba44ddde32ab21cec1547bbf94fa42bc` answered the read-only Adelaide 2026-11-17 questions with GST-inclusive sales AUD 4,241.48, tax AUD 364.92, cost AUD 2,974.97, and gross profit AUD 1,266.51. Given the repository rule that shelf revenue includes GST, ex-GST gross profit is AUD 901.59. Both English and Chinese answers described the reported profit as GST-inclusive. Queries created assistant audit/session records; no sale, refund, stock, purchasing, or price writes were issued.

## Change

The native overview now uses header tax or complete sale-item tax totals, marks tax coverage incomplete when neither source is complete, calculates gross profit as revenue minus tax minus cost, and calculates margin against ex-GST revenue. AI single-date and comparison responses use the same basis and withhold profit when tax or cost coverage is missing. Classifier guidance and the AI capability table now state the same rule.

## Verification

- Java 21 targeted tests before implementation: 34 tests, 6 expected failures covering the old GST-inclusive amount, missing-tax handling, and answer wording.
- Java 21 targeted tests after implementation: `mvn -B '-Dtest=NativeOverviewPayloadTest,ReportRespondNodeTest' test`; 34 tests, 0 failures/errors/skips.
- The Maven output includes pre-existing compiler warnings in `SqlAst` and `SqlGuard` and dynamic test-agent warnings.
- `git diff --check`: pending final candidate review.
- Full exact-candidate `mvn -B clean verify`: not yet run.
- Candidate GitHub workflow dispatch attempt was rejected by the execution policy before dispatch; no run ID was created.
- Deployment and post-deployment Demo reconciliation: not run.

## Scope and Limits

The source candidate is based on `origin/main` at `228166e8ba44ddde32ab21cec1547bbf94fa42bc`. The online finding is from Demo only and does not independently verify every refund/tax-import shape. No online model call or POS business write was made for this test run. Do not treat the candidate as deployed or accepted until the full candidate build and read-only Demo reconciliation pass.
