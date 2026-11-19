# AI aggregate stock question routing

## Change

Aggregate stock questions were falling through classification, while “有多少商品库存是负数？” could be captured by the product-catalogue count shortcut. Added a deterministic, read-only response for explicit total-unit and negative-stock-count questions. The response identifies the known mismatch between aggregate and item-level inventory data and opens the stock list; it does not present an untrusted total.

## Verification

- Regression: `AssistantFastPathRouterTest` first failed on the missing route, then passed 74/74 after the fix. Existing generic “How many items are in stock?” navigation remains unchanged.
- GitHub Java 21 `mvn -B clean verify`: PASS for exact commit `e08cecc5df42a6a15797bab9f26957ade345862`, [workflow run](https://github.com/aishawn/aistore_pos/actions/runs/44545087262).
- Commit pushed to `main`; read-only `/api/public/version` checks on Demo and SKR both report frontend/backend `e08cecc5df42a6a15797bab9f26957ade345862`.
- Authenticated behavior check: BLOCKED because no Demo/SKR login credential file or environment variable is available in this session. No assistant prompt was sent, and no POS business write was made.

## Data issue and follow-up

The prior Demo read showed Native Overview with 53,409 positive on-hand units and 5,373 negative-stock SKUs, while `/api/products/on-hand-summary` reported 11,545 products, -3,406 item units, -71,411 cases, and -1,221,603.24 inventory value. These disagreeing totals make an aggregate answer unsafe. The aggregate SQL has not been changed. Next step: reconcile the summary SQL against item-level stock rows and the Native Overview definition using authenticated, read-only access; correct the shared query only after unit/case and negative-stock semantics are established.

The deterministic response is deployed, but its exact API payload remains unverified online until authenticated access is available.
