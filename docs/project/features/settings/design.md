# Settings 1:1 — design

## Authority

- Orithos `settings` + native catalogue tables are writable SoT.
- Ownership marker: vendor setting `meta.owned.{name}=orithos` after UI/API save.
- Shopfront import (`settings_import` / `POST .../settings:import`) writes only empty or unowned keys/rows.

## Surfaces

1. Setup sidebar — 23 Shopfront-aligned items + Data + AI Health.
2. Company KV editor — General / Display / Login / Sell Screen / Outlets / Date&Time / Currency / Search / Integrations / Misc.
3. Catalogue CRUD — Tax, Payment, Receipts, Statements, Sale Keys, Transferees, Customer Display, Barcodes, Price Sets, Promotion Categories, Registers & Outlets.
4. Enterprise + Push — `/api/settings/enterprise`, `/api/settings/push`.
5. Integrations — on-demand promote from staged Shopfront rows.

## Engine wiring

- `CompanySettingsService.cashRoundTo()` → `CashRounding.roundTo` in `CheckoutService`.
- Further pricing algorithms (quantity rate / family / redistribute) remain future acceptance items; keys are persisted.

## Crawler

- Collectors added for taxRates, paymentMethods, saleKeys, receipts, users, roles, pageRules, barcodeTemplates, priceSets, promotionCategories, statements, transferees, customerDisplays.
- Job `settings_import` stages then promotes; not hooked into daily overwrite.
