# Test Session: 2026-11-09 Demo native checkout loop

| Field | Value |
|---|---|
| Session ID | `2026-11-09-demo-native-checkout-loop` |
| Environment | Online Demo `https://demo.orithos.com.au` + live PostgreSQL `postgres` |
| Runtime SHA | `1392e64660221121402f73688151e90239df65ea` |
| Database | `postgres` (tenant vendor `1` / outlet `1`); `isolated=true` via tenant allowlist attestation |
| Business writes | Yes — open session, cash sale, refund, close (Demo UAT tenant only) |

## Scope

Prove Demo native POS open → sell → refund → close with idempotent replay after GST and stock were seeded for product `1`.

## Results

| Check | Result | Notes |
|---|---|---|
| Seed GST tax_rate + product tax | PASS | Prior step in this workstream |
| Seed `product_inventory` qty 100 for product 1 / outlet 1 | PASS | `inventory=[(1, 1, Decimal('100.0000'))]` |
| Open register session | PASS | Session `#3`, opening float `$100` |
| Quote + cash checkout | PASS | Sale `#6` / `INV-1794201052166`, total `$4.50`, GST `$0.41` |
| Checkout idempotent replay | PASS | Same `saleId` |
| Refund | PASS | Refund sale `#7` / `REF-1794201052167` |
| Refund idempotent replay | PASS | Same `refundSaleId` |
| Close session | PASS | Movement `0`, expected cash `$100` after sale+refund net-out |
| Close idempotent replay | PASS | Same closure id |

Machine evidence: [2026-11-09-demo-native-checkout-loop.json](./2026-11-09-demo-native-checkout-loop.json)

## Limits

- Demo catalogue remains a tiny seed (1 product), not Shopfront ~10849 parity.
- Dedicated `orithos_uat` database clone was not required for this gate; live ledger stayed on attested `postgres`.
- SKR cutover and crawler `ledger=orithos` were not changed in this session.
