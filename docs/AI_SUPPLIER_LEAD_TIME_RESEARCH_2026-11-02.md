# Supplier lead-time research (2026-11-02)

The new read-only collector inspected the last 365 days of Odoo purchase orders
and completed stock receipts for the two configured companies.

| Company | Purchase orders | Completed receipts | Valid lead-time observations | Suppliers |
| ---: | ---: | ---: | ---: | ---: |
| 5 (SKR) | 0 | 0 | 0 | 0 |
| 137 (Demo) | 0 | 0 | 0 | 0 |

Conclusion: there is no reliable PO-to-receipt history in `aipos_uat` from which
to infer supplier lead times. The replenishment API must keep lead-time quality
at `UNKNOWN`, and recommendations must remain manual-review only. The collector
does not write Odoo data and emits `writeRequests: []`.

The implementation preserves empty JSON-RPC lists instead of treating them as
incomplete data, so future purchase history will be measurable without changing
the safety boundary:

```text
scripts/ai-eval/infer-supplier-lead-times.py
```

Source reports were written outside Git under `.local/ai-eval/` for company 5
and company 137.
