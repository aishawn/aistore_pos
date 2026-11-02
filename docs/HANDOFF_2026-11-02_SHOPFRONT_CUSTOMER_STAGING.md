# Shopfront customer staging handoff

Updated: 2026-11-02 (Asia/Shanghai)

## OAuth and worker state

- Shopfront OAuth callback completed with `status=authorized` for store `skr`.
- No sync job was active before customer sync was queued.
- Customer sync job `23` completed successfully.
- Crawler currently stores 20 Shopfront customers.

## POS staging

- Added the token-protected `customers:upsert` integration endpoint.
- Customer staging is keyed by `(store_key, source_id)` and stores the external ID, selected lookup fields, and source payload.
- The endpoint writes only `shopfront_customer`; it does not write the POS customer business table or Odoo.
- Customer job payload reported `pos_staged.customers=20`.
- POS coverage confirmed customers `20`, suppliers `109`, and purchase orders `2,355` for `skr`.
- Crawler audit reported products `11,024`, sales `155,402`, sale items `304,494`, inventory `10,846`, and customers `20`.

## Code and verification

- PR: https://github.com/aishawn/aistore_pos/pull/7 (merged).
- Candidate SHA `868d998144dd18d47e38bee9a64e56fae5751755` passed the GitHub Actions Java 21 `mvn -B clean verify` workflow before merge.
- Main SHA: `f02867a562879c0189b0da3360da2867d85b7fc5`; its Java 21 workflow also completed successfully.
- Runtime availability was confirmed through the crawler's authenticated POS staging coverage call. The environment did not expose Dokploy's running Git SHA, so runtime identity is not independently confirmed here.
- Local checks: `git diff --check` and Python `py_compile` passed. No local Maven build was run.

## Historical sales reconciliation

The earlier full-history comparison found crawler sales `155,402` and POS sales `155,408`. There were zero crawler-only IDs and six POS-only IDs. Shared sale item counts matched; the 47 item-count difference came from the six extra POS records. Those records were not deleted.

POS-only sale IDs:

- `11f11d0303a3f640833f0637e498780f`
- `11f184c3d285e374b4f30acc671ac741`
- `11f1ce64b5218ef694ce0affcc79ec71`
- `11f1d34397b788b4baa206ffd5ef8421`
- `11f1d4128eb6865a9ad506ffede3792f`
- `11f1d4488dd3aaacafd402ffff2bbb27`

## Next actions

- Continue observing the scheduled crawler jobs for stalled phase/count changes.
- Do not remove POS-only historical sales without business review.
- Keep Shopfront customer data in staging until a separately approved business import workflow exists.
