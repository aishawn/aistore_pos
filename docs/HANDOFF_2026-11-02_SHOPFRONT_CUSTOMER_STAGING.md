# Shopfront customer staging handoff

Updated: 2026-11-02 (Asia/Shanghai)

## OAuth and worker state

- Shopfront OAuth callback completed with `status=authorized` for store `skr`.
- No sync job was active before customer sync was queued.
- Customer sync job `23` completed successfully.
- Crawler currently stores 20 Shopfront customers.
- Earlier customer permission failures (jobs `16` and `20`) were resolved after OAuth reauthorization; job `23` completed with 20 customers staged.
- Supply-chain job `22` completed with 109 suppliers and 2,355 purchase orders staged. Earlier permission failures in job `19` were superseded by this successful run.
- Daily sync job `24` refreshed Adelaide business date `2026-11-02`: 94 sales processed and 94 upserted to POS staging; POS import status was `completed`.

## POS staging

- Added the token-protected `customers:upsert` integration endpoint.
- Customer staging is keyed by `(store_key, source_id)` and stores the external ID, selected lookup fields, and source payload.
- The endpoint writes only `shopfront_customer`; it does not write the POS customer business table or Odoo.
- Customer job payload reported `pos_staged.customers=20`.
- Final POS coverage confirmed products `11,024`, inventory `10,846`, sales `155,502`, sale items `304,737`, suppliers `109`, customers `20`, and purchase orders `2,355` for `skr`.
- Final crawler audit reported products `11,024`, inventory `10,846`, sales `155,496`, sale items `304,690`, suppliers `109`, customers `20`, and purchase orders `2,355`.
- POS also reports 187,392 payments; crawler audit does not expose a payment total, so payment counts were not compared independently.
- A read-only crawler sales pagination sample counted approximately 186,653 source payment entries, but high-volume pagination produced one transient transport EOF and the endpoint does not expose a stable total field. Treat the 739-entry difference from POS as an unresolved payment reconciliation item, not as a proven missing sync. No payment rows were deleted or overwritten outside the normal external-ID upsert.
- Product ID reconciliation returned 11,024 IDs on each side, with zero crawler-missing and zero POS-only product IDs.

## Code and verification

- PR: https://github.com/aishawn/aistore_pos/pull/7 (merged).
- Candidate SHA `868d998144dd18d47e38bee9a64e56fae5751755` passed the GitHub Actions Java 21 `mvn -B clean verify` workflow before merge.
- Main SHA: `f02867a562879c0189b0da3360da2867d85b7fc5`; its Java 21 workflow also completed successfully.
- Runtime availability was confirmed through the crawler's authenticated POS staging coverage call. The environment did not expose Dokploy's running Git SHA, so runtime identity is not independently confirmed here.
- Local checks: `git diff --check` and Python `py_compile` passed. No local Maven build was run.

## Historical sales reconciliation

The earlier full-history comparison found zero crawler-only IDs and six POS-only IDs. After job `24` added 94 same-day sales to both sides, crawler sales were `155,496` and POS sales `155,502`. Shared sale item counts matched; the current 47-line difference comes from the six extra POS records. Those records were not deleted.

POS-only sale IDs:

- `11f11d0303a3f640833f0637e498780f`
- `11f184c3d285e374b4f30acc671ac741`
- `11f1ce64b5218ef694ce0affcc79ec71`
- `11f1d34397b788b4baa206ffd5ef8421`
- `11f1d4128eb6865a9ad506ffede3792f`
- `11f1d4488dd3aaacafd402ffff2bbb27`

## Next actions

- Continue observing the scheduled crawler jobs for stalled phase/count changes.
- The `2026-11-02` sync refreshed the current Adelaide business date; the scheduled daily job will revisit it in its normal rolling window.
- Do not remove POS-only historical sales without business review.
- Reconcile payment IDs by external sale and payment key before changing the 739-entry difference; do not infer missing payments from aggregate counts alone.
- Keep Shopfront customer data in staging until a separately approved business import workflow exists.
