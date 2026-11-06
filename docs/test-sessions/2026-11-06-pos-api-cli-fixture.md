# 2026-11-06 POS API CLI REST fixture

## Scope

Source SHA: `e9a01aad` (`main`). Python CLI fixture tests only. Business writes: 0. No deployment or authenticated UAT write was confirmed in this session.

## Checks

- PASS: `python -m unittest discover -s tools/tests -v` (2/2).
- PASS: CLI attaches the configured bearer token to resource and operation reads.
- PASS: a write without `--confirm` is rejected before sending a request.
- PASS: confirmed batch write sends `Idempotency-Key`; CLI output does not expose the configured token.
- PASS: SKR and Demo `/api/pos/v1/openapi.yaml` return `200 text/yaml`.
- NOT DEPLOYED at check time: SKR and Demo `/api/public/version` both reported `9265c7df6446c202678101e5c097722dfb53d039`, preceding this source SHA.
- NOT RUN: authenticated token lifecycle, scope/tenant isolation, Odoo `aipos_uat` writes, idempotency replay/conflict, webhook delivery, and refund cleanup.

## Limits

The local HTTP fixture verifies CLI request construction and safeguards only. It does not prove server authorization, Odoo integration, data isolation, deployment, or business-write correctness. The administrator credential variables were absent from this workspace, so no token was created and no live business data was changed.
