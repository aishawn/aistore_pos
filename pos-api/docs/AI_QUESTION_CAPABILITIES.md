# POS AI Question Capabilities

The assistant is read-only. Report answers use the authenticated Orithos outlet; the model never selects a tenant or writes business data.

| Questions | Supported behavior | Source and limits |
|---|---|---|
| Sales/revenue and gross profit, including Chinese and English date phrasing | Returns sales and, when costs are complete, gross profit | Shared `ReportQueryService.nativeOverview` used by `/api/reports/native-overview`; Adelaide business dates; revenue less cost, GST inclusive. Missing cost makes profit unavailable, never zero-filled. |
| Sales by product category, quantity, average ticket | Fixed allowlisted read-only report templates | Outlet-scoped `ai_rpt_*` views. Category names are matched against product/category names. |
| Stock lookup, dead stock, stock value | Fixed allowlisted read-only report templates | Current Orithos inventory snapshot. Stock value requires cost permission and excludes/marks products without recorded positive cost. |
| Product lookup and count | Native product search/count | Current outlet catalogue; no cross-outlet lookup. |
| Replenishment, price review, sommelier and other workflow requests | Read-only preview or explicit navigation card | No purchase, price, inventory, or sales mutation is performed by Q&A. Sommelier recommendation quality is outside this report capability contract. |
| Comparisons, rankings, mixed arbitrary metrics, invoice/purchase history, unsupported data | Guided refusal | No arbitrary SQL/NL2SQL execution. Ask a supported single metric question or use its report page. |

AI report responses include source, authenticated store scope, Adelaide timezone, inclusive business-date period, data timestamp, and availability status. A `no_data` status means the source was available and returned no rows; `unavailable` means the report could not be verified.

## Acceptance cases

- `昨天利润如何？` and `What was profit yesterday?` route to the authoritative sales overview.
- When sale cost coverage is incomplete, the answer includes revenue and explicitly says gross profit is unavailable.
- With complete costs, answer revenue and gross profit match the same outlet/date in `/api/reports/native-overview` exactly.
- A profit query filtered by category currently refuses because the authoritative report does not provide a category-scoped profit aggregate.
- Rankings, mixed metrics, and date-vs-date comparisons remain guided refusals until a fixed, report-backed aggregate is implemented.
- Cross-store, destructive SQL, write requests, and arbitrary SQL remain unavailable; all assistant responses keep `writeRequests` empty.
