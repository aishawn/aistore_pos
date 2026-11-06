# POS API UAT tax ID payload diagnosis - 2026-11-06

## Target and identity

- Target: `https://demo.orithos.com.au`, authenticated as the Demo store administrator; password read from the ignored local env file and never written to output or evidence.
- UAT gate: `isolated=true`, database `aipos_uat`; frontend and backend commit `f26e20a78da2c8c5553f9958b0e3e7d6b31ac1e9`.
- Write flags: POS Dokploy configuration had the sales, inventory, and purchase API gates enabled.
- All temporary API tokens used for discovery were revoked. No long-lived token or secret was recorded.

## Read-only checks

- API token create/revoke: PASS.
- `products`, `inventory`, `sales`, and `suppliers` list endpoints: PASS.
- Sale quote: PASS for config `171`, variant `669408`, one unit; total `AUD 63.99`.
- The earlier example IDs `product 83`, `quant 590098`, and `sale 8064930` were not visible in this vendor scope. They were not used for a write.
- Current eligible test stock was quant `578161`, variant `669408`, location `1609`, quantity `2`.

## Write attempt and diagnosis

- One API sale batch was accepted and polled by its operation ID. It completed with `created=0`, `errorCount=1`, code `odoo_sync_from_ui_rejected_typeerror`.
- Dokploy Odoo 19 logs show `TypeError: unhashable type: 'list'` while creating a POS order line through `sync_from_ui`. The API sent `tax_ids` as ORM many2many commands (`[[6,0,[...]]]`); `sync_from_ui` expects a flat array of tax IDs.
- No refund was attempted after the failed sale. Inventory, purchase, and webhook writes were not run. The operation reported zero created rows.
- A follow-up code candidate now validates and sends flat integer tax IDs for sale and refund lines, with a regression test rejecting nested command lists. It remains unpushed pending the exact-candidate Java 21 remote gate.
- The canonical OpenAPI spec is now stored in `pos-ui/openapi.yaml`, inside the frontend image build context. Its `prebuild` sync script refreshes both public copies; the documentation copy has the same SHA256 (`22b862e1…`).

## Result

Status: BLOCKED pending remote build, deployment, and a corrected UAT sale/refund run. The failure exposed a real payload contract defect; fixture coverage alone is not acceptance. After the new runtime is attested, repeat sale create/replay/key-conflict, refund, reversible stock count, draft purchase, webhook delivery visibility on a user-owned endpoint, then revoke the temporary token and webhook subscription. Do not use production `aipos`.
