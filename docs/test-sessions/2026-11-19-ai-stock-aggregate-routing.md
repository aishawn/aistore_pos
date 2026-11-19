# AI aggregate stock question routing

## Change

Aggregate stock questions were falling through classification, while “有多少商品库存是负数？” could be captured by the product-catalogue count shortcut. Added a deterministic, read-only response for explicit total-unit and negative-stock-count questions. It does not present an unsupported total or claim a specific data defect; it opens the stock list for review.

## Verification

- Regression: `AssistantFastPathRouterTest` first failed on the missing route, then passed 74/74 after the fix. Existing generic “How many items are in stock?” navigation remains unchanged.
- GitHub Java 21 `mvn -B clean verify`: PASS for exact commit `e08cecc5df42a6a15797bab9f26957ade345862`, [workflow run](https://github.com/aishawn/aistore_pos/actions/runs/44545087262).
- Commit pushed to `main`; read-only `/api/public/version` checks on Demo and SKR both report frontend/backend `e08cecc5df42a6a15797bab9f26957ade345862`.
- Authenticated behavior check: BLOCKED because no Demo/SKR login credential file or environment variable is available in this session. No assistant prompt was sent, and no POS business write was made.

## Outlet-scope correction

Code review found Native Overview summed `product_inventory` by `product_id` without filtering the inventory rows by the requested `outlet_id`, unlike the product inventory mapper. Added the outlet predicate and bound the same authenticated outlet to both inventory and product scopes. The regression first failed against the unscoped SQL, then `NativeOverviewCacheTest` passed 4/4. Combined focused verification passed 78/78 across the router and overview cache tests. Exact-SHA Java 21 `mvn -B clean verify` passed for `62a69966cfe656f2848a4f8984da5de166babcc4`, [workflow run](https://github.com/aishawn/aistore_pos/actions/runs/44548934735). Demo and SKR both report frontend/backend runtime `62a69966cfe656f2848a4f8984da5de166babcc4`.

After correcting the query scope, the fixed response wording no longer says the summary still disagrees with item-level rows. Its regression first failed on the stale claim, then the router suite passed 74/74. The on-hand summary's numeric values have not been re-read online, so parity is still unverified. `Offline Test Gates` returned `startup_failure` for commits `1c542595` and `62a69966`; the public run listing returned no job details. The separate Java 21 full verification succeeded.

## Data issue and follow-up

The prior Demo read showed Native Overview with 53,409 positive on-hand units and 5,373 negative-stock SKUs, while `/api/products/on-hand-summary` reported 11,545 products, -3,406 item units, -71,411 cases, and -1,221,603.24 inventory value. The unscoped Native Overview subquery was one confirmed defect and is now fixed. The product summary SQL and intended unit/case and negative-stock semantics still need a read-only, authenticated comparison against item-level stock rows.

The deterministic response and outlet-scope correction are deployed. Their authenticated API behavior and updated inventory totals remain unverified online until authenticated access is available.
