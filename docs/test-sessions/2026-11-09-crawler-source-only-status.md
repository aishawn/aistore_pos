# Crawler source-only / Orithos ledger readiness

Date: 2026-11-09 (Australia/Adelaide business context; session run UTC+8)  
Environment: Local crawler pytest + public crawler health; authenticated live status partially blocked  
Crawler source SHA (this change): `75c84c6f15230cc57944d26a6bc308e9c6740a2c`  
Deployed runtime fingerprint (post-push): `9c8e1ab037b6de5fc3ba5e656ecf736ef5e4ecb7d4a05c2e2dd8b1eb23ad23a4` on `https://crawler.orithos.com.au/healthz` (matches clean local tree at `75c84c6`)  
Prior fingerprint before this change: `4bc51b093c60019d925ef671d3a79c2e0dca9b170f224a16d5cc093a2bbf82fc` (`9cd7745`)  
POS SHA: Not in scope  
Business data writes: 0 (no Shopfront sync queued; no Odoo/Orithos ledger import triggered)

## Scope

Inspect shopfront-crawler ledger routing, source-only archival, and report/sync accuracy blockers for Demo/SKR (`store_key=skr`). Fix code bugs that block accurate daily multi-sync before flipping `SHOPFRONT_STORE_LEDGER_MODES=skr:orithos`.

## Findings (code)

| Area | Result | Notes |
|---|---|---|
| Ledger routing | Ready in code | `SHOPFRONT_STORE_LEDGER_MODES` is single-ledger per store (`odoo` \| `orithos`). Unconfigured stores still default to `odoo`. `source_only=true` skips both ledgers. |
| Demo / SKR identity | Shared | Hosts `demo.orithos.com.au` and `skr.orithos.com.au` map to crawler store `skr` (same Shopfront content). |
| Orithos push path | Ready in code | `imports_to_orithos` → `OrithosClient` product/inventory/sales upserts. Manual Orithos import APIs reject non-orithos stores (`409`). |
| Implied POS mirror | Fixed | Default `POS_API_MIRROR_BASE_URL` was `https://skr.orithos.com.au`, which auto-enabled a second Orithos client on every orithos sync. Default is now empty; dual-host push requires explicit env. |
| Supply-chain cadence | Fixed | `should_include_supply_chain` previously ignored failed/partial runs and waited for the completed-interval only. It now retries after `partial`/`failed`. |
| Supply-chain DB durability | Hardened | After long Shopfront pagination, session `rollback()` + `expire_all()` before persist (in addition to pre-fetch `commit` / heartbeat from `83181b9` / `9cd7745`). |
| Source reports | Prior fix holds | Sales report query alignment and polling already restored live report reads for `2026-11-08` (114 transactions) in earlier session evidence. |

## Local verification

| Check | Result |
|---|---|
| Focused pytest (`test_supply_chain`, `test_ledger_modes`, `test_source_only_sync` and follow-up ledger/supply cases) | PASS (28 then 12 on narrower re-run) |
| Secrets in output / commit | None |

## Live probes (this session)

| Check | Result | Notes |
|---|---|---|
| `GET https://crawler.orithos.com.au/healthz` | PASS `200` | `status=ok`; fingerprint matched pre-change tree |
| `GET /api/sync/status?store=skr` without token | `401` | FastAPI auth gate alive |
| Authenticated `/api/*` from this workstation | BLOCKED | Cloudflare Error 1010 / gateway 404 depending on client; local integration token not treated as proof of deployed auth. Prior same-day authenticated evidence remains in `2026-11-09-shopfront-skr-source-reconciliation.md`. |
| Ledger env flip / sync enqueue | NOT RUN | Deliberately not changed |

## Remaining blockers before `ledger=orithos` for Demo

1. **Dokploy env flip is still required:** set `SHOPFRONT_STORE_LEDGER_MODES=skr:orithos` (and keep Odoo import from receiving that store). Do not infer live mode from code defaults.
2. **Confirm POS import contract:** `POS_API_BASE_URL` + token, store mapping via `/api/pos/mappings/skr`, and `POS_IMPORT_ENABLED=true`. Leave `POS_API_MIRROR_*` empty unless a true second API target is needed.
3. **PostgreSQL isolation / tenant attestation for Demo** remains unverified for write authorization (see POS isolation sessions). Do not treat native POS enabled flags as cutover proof.
4. **Source→Orithos count parity** (products/inventory/sales) needs authenticated crawler + POS staging reconciliation after the first non-`source_only` orithos sync.
5. **Retry source-only supply-chain** outside a deploy window if purchase-order archive freshness is required before cutover; extended-data GraphQL `403` scope gaps remain informational for brands/categories etc.
6. **Post-deploy fingerprint:** after Dokploy picks up `75c84c6`, confirm `/healthz` source fingerprint changes from the prior `4bc51b09…` value.

## Verdict

Crawler code can archive with `source_only` and can route regular syncs to Orithos without Odoo dual-write once env is flipped. This session fixed daily supply-chain retry after failures and removed the implied Orithos mirror default. **Cutover remains blocked on Dokploy ledger env, POS mapping/isolation attestation, and post-flip reconciliation — not on missing crawler ledger routing code.**
