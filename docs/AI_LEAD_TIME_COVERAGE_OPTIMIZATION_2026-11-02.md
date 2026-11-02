# Lead-time coverage optimization (2026-11-02)

## Change

The replenishment API now calculates supplier lead-time coverage across eligible,
 purchasable products instead of treating one readable supplier row as full-store
 coverage.

- `AVAILABLE`: at least 80% of eligible products have a valid supplier delay.
- `PARTIAL`: some, but less than 80%, have a valid delay.
- `UNKNOWN`: no valid delay is available or the supplier read failed.
- Products without a delay receive `MISSING_LEAD_TIME` and remain `REVIEW_DATA`.
- The response exposes `supplierLeadTime.coverage`, counts, and
  `manualReviewRequired`.

This keeps lead-time fallback quantities visible while preventing them from being
treated as production-safe recommendations.

## Verification

- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run build`: PASS
- Build manifest includes `/api/odoo/replenishment`.

Online deployment is intentionally not claimed by this local evidence. After the
commit is deployed, re-run the authenticated Demo read-only replenishment check and
the controlled draft RFQ test; SKR must remain read-only.
