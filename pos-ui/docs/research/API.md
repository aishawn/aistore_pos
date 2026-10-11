# Orithos Backend API — Full Reference

Reverse-engineered live from `sea.onorithos.com` (logged in as `admin`) via browser
network capture **and GraphQL schema introspection**. This documents the real backend
contracts so a faithful backend (Spring Boot 3 + MyBatis + MySQL 8.0 + Redis 7.0 + JWT)
can be built. The real server is proprietary (Laravel + Apache + a GraphQL layer) — we
emulate its contracts, not its code.

## Machine-readable companions (in this folder)
- `graphql-schema-full.json` — every type with its fields / enum values (456 types).
- `graphql-operations.json` — every Query (≈110) and Mutation (≈180) with arg names.
- `graphql-schema-summary.json` — type-name/kind index.
- `entity-fields.txt` — flattened fields of the core entities (used to build `schema.sql`).
- `schema.sql` — the MySQL 8.0 DDL derived from the above.

---

## 1. Transport, auth & headers

| Aspect | Detail |
|---|---|
| Base | `https://sea.onorithos.com` |
| Primary API | `POST /graphql` (JSON `{ query, variables }`) |
| Report API | `POST /reports` (SQL-like DSL, see §4) |
| Session | Laravel cookie `laravelsession` (`httponly; secure`), rotated each response. Also `last_login_domain=sea`. |
| CORS | `access-control-allow-origin: *`, methods `GET,POST,PUT,DELETE,OPTIONS` |
| Rate limit | global `x-ratelimit-limit: 300`; GraphQL also `x-graphql-ratelimit-limit: 50000` (per-query cost in `-consumed`) |

**Required request headers (every API call):**
```
content-type: application/json
x-requested-with: XMLHttpRequest
orithos-register-id: <registerId>
orithos-outlet-id:   <outletId>
orithos-instance-id: <deviceInstance>
x-orithos-version:   <client build hash>
x-csrf-token:          <token | undefined>
```

### For your Spring Boot port (recommended mapping)
- Replace the Laravel session cookie with **JWT** (`Authorization: Bearer <jwt>`).
  Put `userId`, `vendorId`, `outletId`, `registerId`, roles/permissions in claims.
- Keep `orithos-outlet-id` / `orithos-register-id` headers (or move into JWT claims)
  since most queries are scoped by outlet/register.
- **Redis**: JWT refresh tokens + denylist (`jwt:blacklist:<jti>`), the report cache
  (`report:<cache.id>` with the returned `expiry` as TTL), rate-limit counters, and the
  register "in use" lock (mirrors `lockResource`/`unlockResource`).

### REST endpoints (non-GraphQL)
| Method | Path | Purpose | Response |
|---|---|---|---|
| GET | `/authorized` | session/auth check | 200 when valid |
| GET | `/user/info` | current user + policies + quickMenu | see below |
| POST | `/graphql` | all entity reads/writes | `{ data, errors }` |
| POST | `/reports` | report engine | `{ data:{ totals, data, columns, range }, key, completed }` |
| (form) | login at `/` | sets `laravelsession` | — |

`GET /user/info` →
```json
{ "id":"...", "name":"admin", "username":"admin", "image":null, "isAdmin":false,
  "quickMenu":[{"id":64460,"url":"/","name":"Sell Screen","external":0}],
  "darkMode":"default", "hostConnections":[], "pendingPasswordReset":0,
  "policies":{ "public":{...}, "private":{...} },
  "integrations":{ "accountsFlow":{ "enabled":false } } }
```

---

## 2. GraphQL conventions
- **Relay connections**: list queries return `...Connection { edges { node { … } }, pageInfo }`.
  Common args: `first: Int`, `after: Cursor`, `ordering: [{ sort, direction }]`, plus
  per-entity filters.
- **Single fetch**: `entity(id: ID)`; **list**: `entities(...filters)`.
- **IDs**: 32-char hex strings (e.g. `11f16b11104cf2aaa227020a2292393f`).
- **Scalars**: `ID, String, Int, Float, Boolean, DateTime, Date, Time, Email, URL, JSON,
  Cursor, Ordering, TimePeriod, IPv4, IPv6, CostTaxRateID`.
- **Errors**: standard `{ "errors": [ { "message", ... } ] }`.

Example (captured) — notifications, loaded on every page:
```graphql
query GetNotifications($register: ID, $outlet: ID) {
  notifications(register:$register, outlet:$outlet, first:50,
                ordering:[{ sort: createdAt, direction: DESC }]) {
    edges { node { id, data, readAt, createdAt } }
  }
}
```

---

## 3. Operation catalog (grouped)

> Full arg lists are in `graphql-operations.json`. `(id)` = single, `(…)` = filtered list.

### Queries — reads
- **Account/identity:** `vendor`, `viewer`, `settings`(via updateSettings), `user(id)`, `users`, `role(id)`, `roles`, `permissions`, `outlet(id)`, `outlets`, `register(id)`, `registers`, `pageRule(type)`, `enterprisePolicies`, `enterpriseConnections`.
- **Products:** `product(id)`, `products(…30+ filters)`, `searchProducts(search)`, `inventoryLog(…)`, `barcodes(…)`, `futurePrices(…)`, `futureCosts(…)`, `buyingPeriods(…)`, `buyingPeriod(id)`, `productBackorders(…)`.
- **Classifications:** `category(id)`, `categories(…)`, `brand(id)`, `brands(…)`, `family(id)`, `families(…)`, `tag(id)`, `tags(…)`, `searchClassifications(search)`.
- **Pricing:** `priceLists`, `priceList(id)`, `priceSets`, `priceSet(id)`, `taxRates`, `taxRate(id)`.
- **Suppliers/orders:** `supplier(id)`, `suppliers(…)`, `order(id)`, `orders(…20+ filters)`, `orderReview(id)`, `transferees`, `transferee(id)`, `vendorConnections`, `vendorConnection(id)`.
- **Customers:** `customer(id)`, `customers(…)`, `customerGroups`, `customerGroup(id)`, `customerPayments(…)`, `customerPayment(id)`, `statements`, `statement(id)`.
- **Sales:** `sale(id)`, `sales(…25+ filters)`, `giftCard(id)`, `giftCards(…)`, `giftCardMovements(…)`, `closures(…)`, `closure(id)`.
- **Stocktake:** `stocktake(id)`, `stocktakes(…)`, `externalStocktakes`, `externalStocktake(id)`.
- **Promotions/marketing:** `promotion(id)`, `promotions(…)`, `promotionCategories`, `promotionCategory(id)`, `shelfTickets(…)`, `ticketQueue(…)`, `ticketTemplates`, `ticketTemplate(id)`, `ticketTemplatePages`, `browseAdminTicketTemplates`.
- **Reporting/security:** `reports`, `report(id)`, `getReportFilter(id,type)`, `securityEvents(…)`, `securityEvent(id)`.
- **Config:** `receipts(type)`, `receipt(id)`, `paymentMethods`, `paymentMethod(id)`, `customerDisplays`, `customerDisplay(id)`, `salesKeys`, `saleKeys(id)`, `barcodeTemplates`, `integrations`, `webhooks`, `webhook(id)`, `pushDevices`, `pushDevice(id)`, `kitchenScreens`, `kitchenScreen(id)`.
- **Utilities:** `trashedItems(…)`, `mailLog(…)`, `notifications(…)`, plus host-sync: `hostConnections`, `hostChanges`, `hostHistory`, `hostRelatedItems`, `pendingHostIdentifiers`.

### Mutations — writes (CRUD per domain)
- **Products:** `createProduct`, `updateProduct`, `updateProducts`(bulk), `deleteProduct`, `bulkUpdateProducts`, `bulkDeleteProducts`, `mergeProducts`, `associateProduct`, `associateBarcode`, `deleteBarcodes`, `adjustInventory`, `createFuturePrices`/`applyFuturePrice(s)`/`removeFuturePrice(s)` (+ `…FutureCost…`), `addProductBackorder`/`update`/`delete`, `addProductCompetitionPrice`/`remove`, `createBuyingPeriod`/`update`/`delete`.
- **Classifications:** `createBrand|Category|Family|Tag` + `update*` + `delete*` + `assign*`(to products), `addTagToCategory`, `addOrderNoteToFamily`.
- **Customers:** `createCustomer`, `updateCustomer`, `deleteCustomer`, `mergeCustomers`, `bulkDeleteCustomers`, `createCustomerGroup`/`update`/`delete`, `createCustomerPayment`, `allocateCustomerPayment`, `voidCustomerPayment`, `createPriceList`/`update`/`delete`.
- **Sales:** `createSale`, `updateSale`, `voidSale`, `unparkSale`, `changeSaleItemReadyStatus`, `createGiftCard`/`updateGiftCard`.
- **Register:** `createMovement`, `closeRegister`, `addRegisterClosureNote`, `updateRegister`, `updateRegisterSurcharging`, `overrideRegisterInvoiceNumber`.
- **Orders:** `createOrder`, `createOrderByMatch`, `updateOrder`, `sendOrder`, `receiveOrder`, `cancelOrder`, `reopenOrder`, `markOrdersAsRelated`, order-review mutations.
- **Suppliers:** `createSupplier`, `updateSupplier`, `deleteSupplier`, `mergeSuppliers`, `createOrFindSupplier`, `assignSupplier`.
- **Promotions:** `createPromotion`, `updatePromotion`, `delete/activate/deactivate/clonePromotion`, `createPromotionCategory`/`update`/`delete`.
- **Stocktake:** `createStocktake`, `stocktakeCount`, `updateStocktake`, `completeStocktake`, `cancelStocktake`, `applyStocktake`, `completeExternalStocktake`, `deleteExternalStocktake`, `updateExternalStocktakeBarcode`.
- **Config:** `createPaymentMethod`/`update`/`delete`, `createTaxRate`/`update`/`delete`/`merge`/`setDefault`, `createUser`/`update`/`delete`, `createRole`/`update`/`delete`/`clone`/`restoreManaged`, `createReceipt`/`update`/`delete`/`clone`, `createStatement`/…, `createTransferee`/…, `createPriceSet`/…, `updateOutlet`, `updateLoyalty`, `updateSettings`, `updateAdditionalFields`, `createSaleKeys`/…, `createCustomerDisplay`/…, `updateBarcodeTemplates`, `updatePageRule`, `addQuickMenuItem`/`remove`, `createVendorConnection`/`update`/`delete`/`regenerate`, `registerWebhook`/`activate`/`deactivate`/`remove`/`regenerateSignature`, `registerPushDevice`/`update`/`delete`.
- **Reports:** `saveReport`, `saveSpecialReport`, `deleteReport`, `updateReportEmailSettings`, `updateUserDashboard`.
- **Misc:** `recoverTrashedItems`, `createNotification`/`read`/`readAll`/`delete`/`deleteAll`, `createSecurityEvent`, `lockResource`/`unlockResource`, host-sync mutations (`applyHostChange`, `mapHostIdentifier`, …).

---

## 4. `POST /reports` — report engine (SQL-like DSL)
Powers the Reporting pages **and** the small "Performance" sparklines on list pages.

Request:
```json
{
  "query": "SELECT revenue FROM sales RANGE week BY product_id WHERE outlet_id = \"<outlet>\" START \"6 months ago\"",
  "key": null, "disableFormat": true, "ignoreDivisionByZero": false, "sendWidestValues": false,
  "cache": { "id": "ui-products-index-page", "expiry": "2026-06-29T11:28:43.833Z" },
  "source": "monolith", "page": 1
}
```
Response:
```json
{ "data": {
    "totals": { "2026 19": 33896.75, "...": 0 },
    "data": [ { "Name": "<id>", "2026 19": "5242.21", "_unsorted_index": "<id>" } ],
    "groups": [], "columns": ["Name","2026 01","...","2026 27"],
    "range": { "start": "2025-12-29 00:00:00", "end": "2026-06-29 23:59:59" },
    "order": [], "nullGroupNames": [] },
  "key": "cf2ec5c9-...", "completed": true }
```
DSL grammar observed: `SELECT <metric|BY_NAME AS "..."> [, …]  FROM sales  RANGE day|week|month
BY <dimension>  WHERE <field> = "..."  START "<relative date>"`. The Sales-report query bar
exposes the same language. **Cache** the response in Redis keyed by `cache.id` until `cache.expiry`.

---

## 5. External services (not part of the app backend — ignore for the clone)
- `support.onorithos.com/api/v2/help_center/...` — Zendesk help articles (contextual help).
- `api.binder.posliquor.com.au/api/blogs` — news/blog widget.
- `y.clarity.ms/collect` — Microsoft Clarity analytics.

---

## 6. Suggested build order (Spring Boot 3 + MyBatis)
1. Auth: login → issue JWT; `/authorized`, `/user/info`; roles/permissions in claims.
2. Reference data: outlets, registers, payment methods, tax rates, classifications.
3. Products (+ prices/inventory/costs/barcodes/suppliers) — the heaviest aggregate.
4. Customers, customer groups, price lists.
5. Sales + register closures; gift cards.
6. Orders/suppliers; stocktake; promotions.
7. Reports endpoint (DSL parser → SQL `GROUP BY` over `sale_item`) with Redis cache.
8. Utilities (mail log, security events, trashed items, vendor connections).

Either expose a real GraphQL layer (e.g. Spring for GraphQL / DGS) to match the client
1:1, or REST endpoints fronting the same MyBatis mappers — the frontend clone can target
whichever you choose.
